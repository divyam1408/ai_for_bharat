"""AI Research Assistant — provides medical research support for doctors."""

import os
from google import genai

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

SYSTEM_PROMPT = """You are an AI medical research assistant supporting doctors in a rural
healthcare system in India. When a doctor asks a medical question, provide:

1. **Evidence-based answers** with references to current medical guidelines
2. **Differential diagnoses** if relevant
3. **Drug interactions** and contraindications if medications are mentioned
4. **Treatment guidelines** appropriate for rural Indian healthcare settings
5. **Red flags** that need immediate attention

Keep your answers concise, professional, and relevant to clinical practice.
Format your response in clear sections with markdown formatting.
Consider resource limitations in rural settings when suggesting treatments.
"""


async def research_query(query: str, context: str = "") -> str:
    """Process a medical research query using Gemini."""

    prompt = query
    if context:
        prompt = f"Context: {context}\n\nQuery: {query}"

    if not GEMINI_API_KEY:
        return _demo_fallback(query)

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.3,
            ),
        )
        return response.text.strip()
    except Exception as e:
        print(f"Gemini API error: {e}")
        return _demo_fallback(query)


def _demo_fallback(query: str) -> str:
    """Provide a demo response when no API key is configured."""
    return f"""## Research Results for: {query}

### Overview
This is a demo response. To get real AI-powered research results, set the `GEMINI_API_KEY` environment variable.

### General Guidelines
- Always consider the patient's complete medical history
- Follow WHO and Indian national treatment guidelines
- Consider resource availability in rural healthcare settings
- Monitor for common drug interactions

### Recommended Next Steps
1. Review the patient's complete symptom history
2. Consider common differential diagnoses
3. Order appropriate diagnostic tests
4. Follow up within 48-72 hours

### References
- WHO Clinical Guidelines (2024)
- Indian National Treatment Guidelines
- Standard Treatment Protocols for Primary Health Centers

*Note: Set GEMINI_API_KEY for real AI research assistance.*
"""
