"""AI Research Assistant — provides medical research support for doctors."""

import os
from pathlib import Path
from dotenv import load_dotenv
import aisuite as ai

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Initialize aisuite client
client = ai.Client()

# Hugging Face configuration
HF_MODEL = "huggingface:Qwen/Qwen3-8B"

SYSTEM_PROMPT_TEMPLATE = """You are an AI medical research assistant supporting a doctor in a rural 
healthcare system in India. You have access to the complete patient case history.

PATIENT CASE CONTEXT:
{case_context}

YOUR ROLE:
- Provide evidence-based medical research and guidance
- Answer the doctor's questions about this specific case
- Suggest differential diagnoses when relevant
"""


async def research_chat(
    message: str,
    chat_history: list[dict],
    patient_chat_history: list[dict] = None,
    feedback_thread: list[dict] = None,
    diagnosis_info: dict = None,
) -> str:
    """
    Conversational research assistant with full case context.
    
    Args:
        message: Doctor's current question
        chat_history: Previous research assistant conversation
        patient_chat_history: Patient-AI doctor conversation
        feedback_thread: Doctor-patient feedback messages
        diagnosis_info: AI diagnosis details
    """
    
    # Build case context from all available information
    case_context = _build_case_context(
        patient_chat_history, 
        feedback_thread, 
        diagnosis_info
    )
    
    # Build system prompt with case context
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(case_context=case_context)
    
    # Build conversation messages
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add previous research chat history
    for msg in chat_history:
        role = "user" if msg["role"] == "doctor" else "assistant"
        messages.append({"role": role, "content": msg["content"]})
    
    # Add current message
    user_prompt = f"""Reply to the following user message:
    {message}
    
    INSTRUCTIONS FOR OUTPUT:
    - Write in a professional clinical tone.
    - Use proper newlines in response to seperate different headings.
    - Do not use conversational phrases.
    - Avoid bold text, markdown headers, or decorative formatting e.g **<heading>**.
    - Keep the response concise and structured.
    """
    messages.append({"role": "user", "content": user_prompt})
    
    if not os.environ.get("HUGGINGFACE_API_KEY", ""):
        return _demo_fallback(message, case_context)
    
    try:
        response = client.chat.completions.create(
            model=HF_MODEL,
            messages=messages,
            temperature=0.4,
        )
        
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Hugging Face API error: {e}")
        return _demo_fallback(message, case_context)


def _build_case_context(
    patient_chat_history: list[dict] = None,
    feedback_thread: list[dict] = None,
    diagnosis_info: dict = None,
) -> str:
    """Build comprehensive case context from all available information."""
    
    context_parts = []
    
    # Add patient-AI conversation
    if patient_chat_history and len(patient_chat_history) > 0:
        context_parts.append("Patient-AI Doctor Conversation:")
        for msg in patient_chat_history:
            role = "Patient" if msg["role"] == "patient" else "AI Doctor"
            context_parts.append(f"- {role}: {msg['content']}")
        context_parts.append("")
    
    # Add AI diagnosis
    if diagnosis_info:
        context_parts.append("AI Preliminary Diagnosis:")
        if diagnosis_info.get("primary_condition"):
            context_parts.append(f"- Primary Condition: {diagnosis_info['primary_condition']}")
        if diagnosis_info.get("confidence"):
            context_parts.append(f"- Confidence: {diagnosis_info['confidence']*100:.0f}%")
        if diagnosis_info.get("urgency"):
            context_parts.append(f"- Urgency: {diagnosis_info['urgency']}")
        if diagnosis_info.get("description"):
            context_parts.append(f"- Description: {diagnosis_info['description']}")
        if diagnosis_info.get("recommended_actions"):
            context_parts.append(f"- Recommended Actions: {diagnosis_info['recommended_actions']}")
        if diagnosis_info.get("differential_diagnoses"):
            context_parts.append(f"- Differential Diagnoses: {diagnosis_info['differential_diagnoses']}")
        context_parts.append("")
    
    # Add doctor-patient feedback thread
    if feedback_thread and len(feedback_thread) > 0:
        context_parts.append("Doctor-Patient Feedback Thread:")
        for msg in feedback_thread:
            role = "Doctor" if msg["sender_role"] == "doctor" else "Patient"
            context_parts.append(f"- {role}: {msg['message']}")
        context_parts.append("")
    
    if not context_parts:
        return "No case context available yet."
    
    return "\n".join(context_parts)


def _demo_fallback(message: str, case_context: str) -> str:
    """Provide a demo response with case context."""
    
    return f"""**Research Assistant Response** (Demo Mode)

I can see the case context:

{case_context if case_context != "No case context available yet." else "_No case information loaded yet_"}

---

**Regarding your question:** "{message}"

In a real deployment with the Hugging Face API key configured, I would:
- Analyze the complete patient case history above
- Provide evidence-based medical guidance specific to this case
- Suggest relevant differential diagnoses
- Highlight any drug interactions or contraindications
- Offer treatment recommendations appropriate for rural healthcare settings

**To enable full AI research assistance:**
Set the `HUGGINGFACE_API_KEY` environment variable in your `.env` file.

---

**Quick Medical Reference:**
- Always consider the patient's complete history
- Follow WHO and Indian national guidelines
- Consider resource availability in rural settings
- Know when to refer to higher centers

Feel free to ask me anything about this case!

*Demo mode - Set HUGGINGFACE_API_KEY for real AI assistance*
"""
