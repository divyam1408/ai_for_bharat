"""Doctor routes — review diagnoses, feedback loop, and AI research assistant."""

from fastapi import APIRouter, Depends, HTTPException
from models import DoctorReview, DoctorFeedbackRequest, ResearchQuery
from auth import get_current_user
from database import (
    get_pending_reports, get_report_by_id, create_final_report,
    get_chat_history, get_doctor_patient_messages,
    save_doctor_patient_message, update_report_status,
)
from services.ai_research import research_query

router = APIRouter(prefix="/api/doctor", tags=["doctor"])


@router.get("/pending")
async def get_pending(user: dict = Depends(get_current_user)):
    """Get all diagnosis reports pending doctor review."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can access this")

    reports = await get_pending_reports()
    return {"reports": reports}


@router.get("/report/{report_id}")
async def get_report_detail(report_id: int, user: dict = Depends(get_current_user)):
    """Get full details of a diagnosis report for review, including chat history."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can access this")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    chat = await get_chat_history(report_id)
    feedback_thread = await get_doctor_patient_messages(report_id)
    return {**report, "chat_history": chat, "feedback_thread": feedback_thread}


@router.post("/review/{report_id}")
async def submit_review(
    report_id: int, review: DoctorReview, user: dict = Depends(get_current_user)
):
    """Submit a doctor review — finalize or request feedback."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can review")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report["status"] == "completed":
        raise HTTPException(status_code=400, detail="Report already finalized")

    if review.is_final:
        # Finalize the diagnosis
        final_id = await create_final_report(
            report_id=report_id,
            patient_id=report["patient_id"],
            doctor_id=user["user_id"],
            original_ai_diagnosis=report["primary_condition"],
            final_diagnosis=review.final_diagnosis,
            doctor_comments=review.doctor_comments,
            modified=review.modified,
        )
        return {
            "message": "Diagnosis finalized successfully",
            "final_report_id": final_id,
            "status": "completed",
        }
    else:
        # Request feedback from patient
        await save_doctor_patient_message(
            report_id=report_id,
            sender_role="doctor",
            message=review.doctor_comments,
        )
        await update_report_status(report_id, "feedback_requested")
        return {
            "message": "Feedback requested from patient",
            "status": "feedback_requested",
        }


@router.post("/feedback/{report_id}")
async def send_feedback_message(
    report_id: int, data: DoctorFeedbackRequest, user: dict = Depends(get_current_user)
):
    """Send an additional feedback message to the patient."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can send feedback")

    report = await get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    await save_doctor_patient_message(
        report_id=report_id,
        sender_role="doctor",
        message=data.message,
    )
    await update_report_status(report_id, "feedback_requested")

    return {"message": "Feedback sent to patient", "status": "feedback_requested"}


@router.post("/research")
async def do_research(data: ResearchQuery, user: dict = Depends(get_current_user)):
    """Query the AI Research Assistant."""
    if user["role"] != "doctor":
        raise HTTPException(status_code=403, detail="Only doctors can use research assistant")

    result = await research_query(query=data.query, context=data.context)
    return {"response": result}
