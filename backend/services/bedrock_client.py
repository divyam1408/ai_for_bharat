import boto3
import json
from botocore.config import Config
from services.prompts import CHAT_SYSTEM_PROMPT, DIAGNOSIS_SYSTEM_PROMPT, RESEARCH_SYSTEM_PROMPT

class BedrockClient:
    def __init__(self, region="ap-south-1"):
        self.control_client = boto3.client(
            service_name = "bedrock",
            region_name=region,
            config=Config(retries={"max_attempts": 3})
        )
        self.client = boto3.client(
            service_name="bedrock-runtime",
            region_name=region,
            config=Config(retries={"max_attempts": 3})
        )

    def _get_model_inference_profile(self, model_id: str) -> str:
        """Get inference profile for a given model id."""
        try:
            resp = self.control_client.list_inference_profiles(typeEquals="SYSTEM_DEFINED")
            for p in resp.get("inferenceProfileSummaries", []):
                if model_id in p.get("inferenceProfileId"):
                    break
            model_id = p.get("inferenceProfileArn")
            return model_id
        except Exception as e:
            print('INFERENCE PROFILE ERROR: ', e)
            return model_id

    # ==========================
    # PUBLIC ENTRY POINT
    # ==========================
    def generate(self, model_id: str, chat_history: list[dict], user_message: str):
        """
        Main orchestration function.
        Detects model family and routes to correct invocation method.
        """

        if model_id.startswith("anthropic."):
            return self._invoke_anthropic(model_id, chat_history, user_message)

        elif model_id.startswith("amazon.nova"):
            return self._invoke_nova(model_id, chat_history, user_message)

        elif model_id.startswith("openai."):
            return self._invoke_openai(model_id, chat_history, user_message)

        elif model_id.startswith("qwen."):
            return self._invoke_qwen(model_id, chat_history, user_message)

        elif model_id.startswith("deepseek."):
            return self._invoke_deepseek(model_id, chat_history, user_message)

        else:
            raise ValueError(f"Unsupported model family for model_id: {model_id}")


    # ==========================
    # ANTHROPIC (BEDROCK HOSTED)
    # ==========================
    def _invoke_anthropic(self, model_id, chat_history, user_message):
        model_id = self._get_model_inference_profile(model_id)
        messages = []
        for msg in chat_history:
            role = "user" if msg["role"] == "patient" else "assistant"
            messages.append({"role": role, "content": msg["content"]})
        
        # Add the new message
        messages.append({"role": "user", "content": user_message})
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "system": CHAT_SYSTEM_PROMPT,
            "max_tokens": 800,
            "messages": messages
        })

        response = self.client.invoke_model(
            modelId=model_id,
            body=body,
            contentType="application/json",
            accept="application/json"
        )

        data = json.loads(response["body"].read())
        print('AI RESPONSE:', data)
        return data["content"][0]["text"]

    # ==========================
    # NOVA / QWEN STYLE MODELS
    # ==========================
    def _invoke_nova(self, model_id, chat_history, user_message):
        return self._invoke_messages_api(model_id, chat_history, user_message)

    def _invoke_qwen(self, model_id, chat_history, user_message):
        return self._invoke_messages_api(model_id, chat_history, user_message)
    
    def _invoke_deepseek(self, model_id, chat_history, user_message):
        return self._invoke_messages_api(model_id, chat_history, user_message)

    # ==========================
    # OPENAI (BEDROCK HOSTED)
    # ==========================
    def _invoke_openai(self, model_id, chat_history, user_message):
        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
        for msg in chat_history:
            role = "user" if msg["role"] == "patient" else "assistant"
            messages.append({"role": role, "content": msg["content"]})
        
        # Add the new message
        messages.append({"role": "user", "content": user_message})
        body = json.dumps({
            "messages": [
                {
                    "role": "user",
                    "content": user_message
                }
            ],
            "max_tokens": 800,
            "temperature": 0.3,
            "top_p": 0.9
        })

        response = self.client.invoke_model(
            modelId=model_id,
            body=body,
            contentType="application/json",
            accept="application/json"
        )

        data = json.loads(response["body"].read())
        return data["choices"][0]["message"]["content"]

    # ==========================
    # SHARED MESSAGES API FORMAT
    # (Nova, Qwen, etc.)
    # ==========================
    def _invoke_messages_api(self, model_id, chat_history, user_message):
        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
        for msg in chat_history:
            role = "user" if msg["role"] == "patient" else "assistant"
            messages.append({"role": role, "content": msg["content"]})
        
        # Add the new message
        messages.append({"role": "user", "content": user_message})
        body = json.dumps({
            "messages":messages,
            "inferenceConfig": {
                "maxTokens": 800,
                "temperature": 0.3,
                "topP": 0.9
            }
        })

        response = self.client.invoke_model(
            modelId=model_id,
            body=body,
            contentType="application/json",
            accept="application/json"
        )

        data = json.loads(response["body"].read())
        print('AI RESPONSE:', data)
        return data["choices"][0]["message"]["content"]


    
    def generate_diagnosis_report(self, model_id, transcript: str) -> str:

        if model_id.startswith("anthropic."):
            print('GET INFERENCE', model_id)
            model_id = self._get_model_inference_profile(model_id)
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 3000,
                "system": DIAGNOSIS_SYSTEM_PROMPT,
                "messages": [
                    {"role": "user","content": transcript}
                ]
            })
            response = self.client.invoke_model(
                modelId=model_id,
                body=body,
                contentType="application/json",
                accept="application/json"
            )
            data = json.loads(response["body"].read())
            print('AI Generated Report:', data)
            return data["content"][0]['text']
        else:
            messages = [
                {"role": "system", "content": DIAGNOSIS_SYSTEM_PROMPT},
                {"role": "user", "content": transcript}
            ]   
            body = json.dumps({
                "messages":messages,
                "inferenceConfig": {
                    "temperature": 0.3,
                }
            })
            response = self.client.invoke_model(
                modelId=model_id,
                body=body,
                contentType="application/json",
                accept="application/json"
            )
            data = json.loads(response["body"].read())
            print('AI Generated Report:', data)
            return data["choices"][0]["message"]["content"]
    

    def research_chat(self, model_id, case_context: str, messages: list[dict]) -> str:

        system_prompt = RESEARCH_SYSTEM_PROMPT.format(case_context=case_context)

        if model_id.startswith("anthropic."):
            print('GET INFERENCE', model_id)
            model_id = self._get_model_inference_profile(model_id)
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 800,
                "system": system_prompt,
                "messages": messages,
            })
            response = self.client.invoke_model(
                modelId=model_id,
                body=body,
                contentType="application/json",
                accept="application/json"
            )
            data = json.loads(response["body"].read())
            print('Research AI:', data)
            return data["content"][0]['text']
        else:
            messages = [{'role':'system','content':system_prompt}] + messages
            body = json.dumps({
                "messages":messages,
                "inferenceConfig": {
                    "temperature": 0.4,
                }
            })
            response = self.client.invoke_model(
                modelId=model_id,
                body=body,
                contentType="application/json",
                accept="application/json"
            )
            data = json.loads(response["body"].read())
            print('Research AI:', data)
            return data["choices"][0]["message"]["content"]



