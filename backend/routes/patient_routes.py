"""Patient routes — chat-based diagnosis, feedback responses, and report viewing."""

import base64
import mimetypes
import os
from fastapi import APIRouter, Depends, HTTPException
from models import StartChat, ChatMessage, DiagnosisResponse, PatientFeedbackResponse
from auth import get_current_user

_IS_LAMBDA = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
_UPLOADS_DIR = "/tmp/uploads" if _IS_LAMBDA else os.path.join(os.path.dirname(__file__), "..", "uploads")


def _image_from_attachment(attachment_url: str | None) -> tuple[str | None, str | None]:
    """
    Read an uploaded image file from disk and return (base64_data, media_type).
    Returns (None, None) for missing URLs, non-existent files, or non-image types
    (e.g. PDFs — Claude Vision only supports images).
    """
    if not attachment_url:
        return None, None

    # Extract filename whether URL is absolute (http://host/uploads/f) or relative (/uploads/f)
    if "/uploads/" not in attachment_url:
        return None, None
    filename = attachment_url.rsplit("/uploads/", 1)[-1]
    file_path = os.path.join(_UPLOADS_DIR, filename)

    if not os.path.exists(file_path):
        print(f"[image] Attachment file not found: {file_path}")
        return None, None

    media_type, _ = mimetypes.guess_type(file_path)
    if not media_type or not media_type.startswith("image/"):
        print(f"[image] Skipping non-image attachment: {media_type}")
        return None, None

    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")

    print(f"[image] Loaded attachment: {filename} ({media_type}, {len(b64)} b64 chars)")
    return b64, media_type
from database import (
    create_chat_session,
    save_chat_message,
    get_chat_history,
    get_report_by_id,
    get_reports_for_patient,
    update_report_with_diagnosis,
    get_doctor_patient_messages,
    save_doctor_patient_message,
    update_report_status,
)
from services.ai_doctor import chat_response, generate_diagnosis_from_chat

router = APIRouter(prefix="/api/patient", tags=["patient"])


@router.post("/start-chat")
async def start_chat(data: StartChat, user: dict = Depends(get_current_user)):
    """Start a new chat session — creates a shell report and returns its ID."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can start chats")

    report_id = await create_chat_session(
        patient_id=user["user_id"],
        medical_history=data.medical_history or "",
        current_medications=data.current_medications or "",
        age=data.age,
        gender=data.gender,
    )

    return {"report_id": report_id, "status": "chatting"}


@router.post("/chat/{report_id}")
async def send_chat_message(
    report_id: int, data: ChatMessage, user: dict = Depends(get_current_user)
):
    """Send a message in the patient-AI conversation."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can chat")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if report["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "chatting":
        raise HTTPException(status_code=400, detail="Chat session is no longer active")

    # Save patient message
    await save_chat_message(report_id, "patient", data.message, data.attachment_url)

    # Get full history for context
    history = await get_chat_history(report_id)

    # Read image attachment if present (base64 + media type for Claude Vision)
    image_b64, image_media_type = _image_from_attachment(data.attachment_url)

    # Get AI response
    ai_reply = await chat_response(
        message=data.message,
        chat_history=history[:-1],  # exclude the message we just saved (it's the current one)
        image_b64=image_b64,
        image_media_type=image_media_type,
    )

    # Save AI response
    await save_chat_message(report_id, "assistant", ai_reply)

    return {"reply": ai_reply}


@router.post("/diagnose/{report_id}", response_model=DiagnosisResponse)
async def generate_diagnosis(report_id: int, user: dict = Depends(get_current_user)):
    """End chat and generate a structured diagnosis from the full conversation."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can request diagnosis")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Chat session not found")
    if report["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "chatting":
        raise HTTPException(status_code=400, detail="Diagnosis already generated")

    # Get full chat history
    history = await get_chat_history(report_id)
    if not history:
        raise HTTPException(status_code=400, detail="No chat messages found. Chat first!")

    # Generate diagnosis from the full conversation
    ai_result = await generate_diagnosis_from_chat(
        chat_history=history,
        medical_history=report.get("medical_history", ""),
        current_medications=report.get("current_medications", ""),
        age=report.get("age"),
        gender=report.get("gender"),
    )

    # Summarize patient messages as the symptoms field
    symptoms_summary = " | ".join(
        msg["content"] for msg in history if msg["role"] == "patient"
    )

    # Update the report with diagnosis data
    await update_report_with_diagnosis(
        report_id=report_id,
        symptoms_summary=symptoms_summary,
        primary_condition=ai_result["primary_condition"],
        confidence=ai_result["confidence"],
        urgency=ai_result["urgency"],
        recommended_actions=ai_result["recommended_actions"],
        differential_diagnoses=ai_result["differential_diagnoses"],
        description=ai_result["description"],
    )

    return DiagnosisResponse(
        report_id=report_id,
        primary_condition=ai_result["primary_condition"],
        confidence=ai_result["confidence"],
        urgency=ai_result["urgency"],
        recommended_actions=ai_result["recommended_actions"],
        differential_diagnoses=ai_result["differential_diagnoses"],
        description=ai_result["description"],
    )


@router.post("/respond/{report_id}")
async def respond_to_feedback(
    report_id: int, data: PatientFeedbackResponse, user: dict = Depends(get_current_user)
):
    """Patient responds to doctor's feedback request."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can respond")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if report["status"] != "feedback_requested":
        raise HTTPException(status_code=400, detail="No feedback pending for this report")

    # Save patient response
    await save_doctor_patient_message(
        report_id=report_id,
        sender_role="patient",
        message=data.message,
        attachment_url=data.attachment_url,
    )

    # Move back to pending_review for doctor
    await update_report_status(report_id, "pending_review")

    return {"message": "Response sent to doctor", "status": "pending_review"}


@router.get("/reports")
async def get_my_reports(user: dict = Depends(get_current_user)):
    """Get all diagnosis reports for the logged-in patient."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can view their reports")

    reports = await get_reports_for_patient(user["user_id"])
    return {"reports": reports}


@router.get("/report/{report_id}")
async def get_single_report(report_id: int, user: dict = Depends(get_current_user)):
    """Get a specific diagnosis report with chat history, feedback thread, and final report."""
    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["patient_id"] != user["user_id"] and user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Access denied")

    chat = await get_chat_history(report_id)
    feedback_thread = await get_doctor_patient_messages(report_id)
    return {**report, "chat_history": chat, "feedback_thread": feedback_thread}


@router.delete("/report/{report_id}")
async def delete_report(report_id: int, user: dict = Depends(get_current_user)):
    """Delete a diagnosis report (only if patient owns it and it's in chatting status)."""
    if user["role"] != "patient":
        raise HTTPException(status_code=403, detail="Only patients can delete their reports")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["patient_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Allow deletion of reports in any status for patient's own reports
    from database import delete_report as db_delete_report
    await db_delete_report(report_id)
    
    return {"message": "Report deleted successfully"}
