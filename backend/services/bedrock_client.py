import boto3
import json
from botocore.config import Config
from services.prompts import CHAT_SYSTEM_PROMPT, DIAGNOSIS_SYSTEM_PROMPT

class BedrockClient:
    def __init__(self, region="ap-south-1"):
        self.client = boto3.client(
            service_name="bedrock-runtime",
            region_name=region,
            config=Config(retries={"max_attempts": 3})
        )

    # ==========================
    # PUBLIC ENTRY POINT
    # ==========================
    def generate(self, model_id: str, chat_history: list[dict], user_message: str):
        """
        Main orchestration function.
        Detects model family and routes to correct invocation method.
        """

        if model_id.startswith("amazon.nova"):
            return self._invoke_nova(model_id, chat_history, user_message)

        elif model_id.startswith("openai."):
            return self._invoke_openai(model_id, chat_history, user_message)

        elif model_id.startswith("qwen."):
            return self._invoke_qwen(model_id, chat_history, user_message)

        else:
            raise ValueError(f"Unsupported model family for model_id: {model_id}")



    # ==========================
    # NOVA / QWEN STYLE MODELS
    # ==========================
    def _invoke_nova(self, model_id, chat_history, user_message):
        return self._invoke_messages_api(model_id, chat_history, user_message)

    def _invoke_qwen(self, model_id, chat_history, user_message):
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
    
    def generate_diagnosis_report(self, model_id, messages: list[dict]) -> str:
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
        return data["choices"][0]["message"]["content"]
    
    def research_chat(self, model_id, messages: list[dict]) -> str:
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
        return data["choices"][0]["message"]["content"]


# class BedrockClient:
#     def __init__(self, region="ap-south-1"):
#         self.client = boto3.client(
#             service_name="bedrock-runtime",
#             region_name=region,
#             config=Config(retries={"max_attempts": 3})
#         )

#     def invoke_claude(self, prompt: str):
#         body = json.dumps({
#             "anthropic_version": "bedrock-2023-05-31",
#             "max_tokens": 500,
#             "messages": [
#                 {
#                     "role": "user",
#                     "content": prompt
#                 }
#             ]
#         })

#         response = self.client.invoke_model(
#             modelId="anthropic.claude-3-sonnet-20240229-v1:0",
#             body=body,
#             contentType="application/json",
#             accept="application/json"
#         )

#         response_body = json.loads(response["body"].read())
#         return response_body["content"][0]["text"]

#     def invoke_qwen(self, chat_history, model: str, max_tokens: int = 800, temperature: float = 0.3, ):
#         body = json.dumps({
#             "messages": [
#                 {
#                     "role": "user",
#                     "content": [
#                         {
#                             "type": "text",
#                             "text": prompt
#                         }
#                     ]
#                 }
#             ],
#             "inferenceConfig": {
#                 "maxTokens": 800,
#                 "temperature": 0.3,   # lower = more clinical consistency
#                 "topP": 0.9
#             }
#         })

#         response = self.client.invoke_model(
#             modelId="qwen.qwen3-next-80b-a3b",
#             body=body,
#             contentType="application/json",
#             accept="application/json"
#         )

#         response_body = json.loads(response["body"].read())

#         return response_body["output"]["message"]["content"][0]["text"]

#     def invoke_openai(self, messages, model: str, temperature: int = 0.5, top_p: int = 0.9, max_tokens: int = 500):
#         body = json.dumps({
#             # "messages": [
#             #     {
#             #         "role": "user",
#             #         "content": prompt
#             #     }
#             # ],
#             "messages": messages,
#             "max_tokens": max_tokens,
#             "temperature": temperature,
#             "top_p": top_p
#         })

#         response = self.client.invoke_model(
#             modelId=model,
#             body=body,
#             contentType="application/json",
#             accept="application/json"
#         )

#         response_body = json.loads(response["body"].read())

#         return self.parse_model_response(response_body["choices"][0]["message"]["content"].strip())

#     def parse_model_response(self, response: str) -> str:
#         if "</reasoning>" in response:
#             response = response.split('</reasoning>')[-1]
#         return response


