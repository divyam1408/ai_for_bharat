"""AI Doctor Assistant — conversational diagnosis from patient symptoms."""

import json
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
#HF_MODEL = "huggingface:Intelligent-Internet/II-Medical-8B"
HF_MODEL = "huggingface:Qwen/Qwen3-8B"

# ── System prompts ─────────────────────────────────────────────────────────


CHAT_SYSTEM_PROMPT = """You are a compassionate AI medical assistant for a rural healthcare
system in India. You are having a conversation with a patient to understand their symptoms.

Your goals:
1. Ask clarifying questions about their symptoms (duration, severity, onset, etc.)
2. Ask about relevant medical history, allergies, and current medications
3. Be empathetic and use simple, easy-to-understand language
4. Keep responses concise (2-4 sentences)
5. Do NOT provide a diagnosis during the chat — just gather information

CRITICAL INSTRUCTIONS FOR CONVERSATION FLOW:
- Gather ESSENTIAL information efficiently (main symptoms, duration, severity, medical history)
- After 3-4 exchanges, if you have sufficient information about the patient's condition, 
  provide a CONCLUDING message like: "Thank you for sharing this information. I now have 
  enough details to generate a preliminary report. Please click 'Get Diagnosis' to proceed."
- Do NOT ask endless follow-up questions. Focus on the most important details.
- If the patient has already provided key information (symptoms, duration, severity, medical history),
  conclude the conversation gracefully.
- Do not ask questions and give CONCLUDING message simultaneously.

IMPORTANT: You are NOT a replacement for a real doctor. You are only gathering information
that will be used to generate a preliminary report for a qualified doctor to review.

DO NOT provide Metadata like <Answer>, </Answer> etc in response , be simple and straightforward.
"""

DIAGNOSIS_SYSTEM_PROMPT = """You are an AI medical assistant for a rural healthcare system in India.
Given a full conversation with a patient, generate a structured preliminary diagnosis.

IMPORTANT: You are NOT a replacement for a real doctor. Your diagnosis is preliminary
and will be reviewed by a qualified medical professional.

Respond ONLY with valid JSON in exactly this format (no markdown, no extra text):
{
  "primary_condition": "Name of the most likely condition",
  "confidence": 0.85,
  "urgency": "low|medium|high|critical",
  "recommended_actions": "Comma-separated list of recommended immediate actions",
  "differential_diagnoses": "Comma-separated list of other possible conditions",
  "description": "Brief 2-3 sentence description of the condition and why you suspect it"
}

Guidelines:
- confidence should be between 0.0 and 1.0
- urgency: critical = life-threatening, high = needs attention within hours,
  medium = within a day, low = can wait for scheduled appointment
- Be conservative — when in doubt, rate urgency higher
- Consider common conditions in rural India (tropical diseases, waterborne illness, etc.)
- Use ALL information from the conversation to make your assessment
"""


# ── Chat response ──────────────────────────────────────────────────────────

async def chat_response(
    message: str,
    chat_history: list[dict],
    patient_info: dict | None = None,
) -> str:
    """Generate a conversational response to gather more symptom info."""

    # Build conversation for aisuite
    messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    
    for msg in chat_history:
        role = "user" if msg["role"] == "patient" else "assistant"
        messages.append({"role": role, "content": msg["content"]})
    
    # Add the new message
    messages.append({"role": "user", "content": message})

    if not os.environ.get("HUGGINGFACE_API_KEY", ""):
        return _chat_demo_fallback(message, len(chat_history))

    try:
        response = client.chat.completions.create(
            model=HF_MODEL,
            messages=messages,
            temperature=0.5,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Hugging Face chat error: {e}")
        return _chat_demo_fallback(message, len(chat_history))


# ── Final diagnosis from chat history ──────────────────────────────────────

async def generate_diagnosis_from_chat(
    chat_history: list[dict],
    medical_history: str = "",
    current_medications: str = "",
    age: int | None = None,
    gender: str | None = None,
) -> dict:
    """Generate a structured diagnosis from the full chat conversation."""

    # Build a transcript of the conversation
    transcript = "=== Patient-AI Conversation ===\n"
    for msg in chat_history:
        label = "Patient" if msg["role"] == "patient" else "AI Assistant"
        transcript += f"{label}: {msg['content']}\n"
    transcript += "=== End of Conversation ===\n\n"

    transcript += f"""Additional Patient Information:
- Medical History: {medical_history or 'Not provided'}
- Current Medications: {current_medications or 'None'}
- Age: {age or 'Not provided'}
- Gender: {gender or 'Not provided'}

Based on the full conversation above, provide your preliminary diagnosis as JSON.
"""

    if not os.environ.get("HUGGINGFACE_API_KEY", ""):
        # Extract symptoms from all patient messages for the fallback
        all_symptoms = " ".join(
            msg["content"] for msg in chat_history if msg["role"] == "patient"
        )
        return _diagnosis_demo_fallback(all_symptoms)

    try:
        messages = [
            {"role": "system", "content": DIAGNOSIS_SYSTEM_PROMPT},
            {"role": "user", "content": transcript}
        ]
        
        response = client.chat.completions.create(
            model=HF_MODEL,
            messages=messages,
            temperature=0.3,
        )
        
        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]
        return json.loads(text)
    except Exception as e:
        print(f"Hugging Face diagnosis error: {e}")
        all_symptoms = " ".join(
            msg["content"] for msg in chat_history if msg["role"] == "patient"
        )
        return _diagnosis_demo_fallback(all_symptoms)


# ── Demo fallbacks ─────────────────────────────────────────────────────────

def _chat_demo_fallback(message: str, turn_count: int) -> str:
    """Provide conversational demo responses without an API key."""
    if turn_count == 0:
        return (
            "Thank you for reaching out. I'd like to understand your symptoms better. "
            "Can you tell me how long you've been experiencing these symptoms, "
            "and have they been getting worse?"
        )
    elif turn_count <= 2:
        return (
            "I see, that's helpful information. Do you have any other symptoms "
            "like headache, body aches, loss of appetite, or changes in sleep? "
            "Also, are you currently taking any medications?"
        )
    else:
        return (
            "Thank you for sharing all this information. I have a good understanding "
            "of your symptoms now. When you're ready, you can click 'Get Diagnosis' "
            "and I'll generate a preliminary report for a doctor to review."
        )


def _diagnosis_demo_fallback(symptoms: str) -> dict:
    """Provide a plausible demo diagnosis when no API key is available."""
    symptoms_lower = symptoms.lower()

    if any(w in symptoms_lower for w in ["fever", "temperature", "hot"]):
        return {
            "primary_condition": "Viral Fever",
            "confidence": 0.72,
            "urgency": "medium",
            "recommended_actions": "Rest, adequate hydration, paracetamol for fever, monitor temperature",
            "differential_diagnoses": "Dengue Fever, Malaria, Typhoid Fever, Upper Respiratory Infection",
            "description": "The combination of fever symptoms suggests a viral infection. "
                           "Given the rural Indian context, tropical infections like Dengue and "
                           "Malaria should be ruled out through blood tests.",
        }
    elif any(w in symptoms_lower for w in ["cough", "cold", "throat", "breathing"]):
        return {
            "primary_condition": "Upper Respiratory Tract Infection",
            "confidence": 0.68,
            "urgency": "low",
            "recommended_actions": "Rest, warm fluids, steam inhalation, avoid cold beverages",
            "differential_diagnoses": "Bronchitis, Allergic Rhinitis, Pneumonia, Tuberculosis",
            "description": "Respiratory symptoms suggest an upper respiratory tract infection. "
                           "If symptoms persist beyond a week or worsen, further investigation "
                           "for pneumonia or tuberculosis may be necessary.",
        }
    elif any(w in symptoms_lower for w in ["stomach", "diarrhea", "vomit", "nausea", "abdomen"]):
        return {
            "primary_condition": "Acute Gastroenteritis",
            "confidence": 0.70,
            "urgency": "medium",
            "recommended_actions": "ORS solution, bland diet, avoid spicy food, monitor for dehydration",
            "differential_diagnoses": "Food Poisoning, Cholera, Amoebiasis, Peptic Ulcer Disease",
            "description": "Gastrointestinal symptoms suggest acute gastroenteritis, commonly "
                           "caused by contaminated water or food. Dehydration prevention is critical, "
                           "especially in rural settings.",
        }
    else:
        return {
            "primary_condition": "General Medical Consultation Required",
            "confidence": 0.45,
            "urgency": "medium",
            "recommended_actions": "Schedule physical examination, basic blood work, vital signs monitoring",
            "differential_diagnoses": "Multiple conditions possible — needs clinical examination",
            "description": "The described symptoms require further clinical evaluation. "
                           "A physical examination and basic diagnostic tests are recommended "
                           "to narrow down the diagnosis.",
        }
