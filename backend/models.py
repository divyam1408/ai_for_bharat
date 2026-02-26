"""Pydantic models for request/response validation."""

from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum


# ── Enums ──────────────────────────────────────────────────────────────────

class UserRole(str, Enum):
    PATIENT = "patient"
    DOCTOR = "doctor"


class ReportStatus(str, Enum):
    CHATTING = "chatting"
    PENDING_REVIEW = "pending_review"
    FEEDBACK_REQUESTED = "feedback_requested"
    UNDER_REVIEW = "under_review"
    COMPLETED = "completed"


class UrgencyLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ── Auth Models ────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    role: UserRole
    specialization: Optional[str] = None  # for doctors


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    role: str
    user_id: int
    name: str


# ── Patient Models ─────────────────────────────────────────────────────────

class PatientSymptoms(BaseModel):
    symptoms: str  # free-text symptom description
    medical_history: Optional[str] = ""
    current_medications: Optional[str] = ""
    age: Optional[int] = None
    gender: Optional[str] = None


class DiagnosisResponse(BaseModel):
    report_id: int
    primary_condition: str
    confidence: float
    urgency: str
    recommended_actions: str
    differential_diagnoses: str
    description: str


class StartChat(BaseModel):
    medical_history: Optional[str] = ""
    current_medications: Optional[str] = ""
    age: Optional[int] = None
    gender: Optional[str] = None


class ChatMessage(BaseModel):
    message: str
    attachment_url: Optional[str] = None  # optional uploaded file URL


class PatientFeedbackResponse(BaseModel):
    message: str
    attachment_url: Optional[str] = None


# ── Doctor Models ──────────────────────────────────────────────────────────

class DoctorReview(BaseModel):
    final_diagnosis: str
    doctor_comments: str
    modified: bool = False
    is_final: bool = True
    # Prescription template fields (required when is_final=True)
    prescribed_medications: Optional[str] = ""
    dosage_instructions: Optional[str] = ""
    follow_up_date: Optional[str] = ""
    diet_lifestyle: Optional[str] = ""
    additional_instructions: Optional[str] = ""


class DoctorFeedbackRequest(BaseModel):
    message: str


class ResearchQuery(BaseModel):
    query: str
    context: Optional[str] = ""  # optional diagnosis context
