"""Patient routes — chat-based diagnosis, feedback responses, and report viewing."""

from fastapi import APIRouter, Depends, HTTPException
from models import StartChat, ChatMessage, DiagnosisResponse, PatientFeedbackResponse
from auth import get_current_user
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

    # Get AI response
    ai_reply = await chat_response(
        message=data.message,
        chat_history=history[:-1],  # exclude the message we just saved (it's the current one)
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
