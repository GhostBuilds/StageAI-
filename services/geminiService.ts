
import { GoogleGenAI } from "@google/genai";
import { StagingStyle } from "../types";
import { getPromptForStyle } from "../constants";

// Helper to resize and compress image to ensure stable API calls
const optimizeImageForApi = (base64Str: string, maxDim = 1536): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onerror = () => reject(new Error("Failed to load image for optimization."));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Maintain aspect ratio while capping the maximum dimension
      if (width > height) {
        if (width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str); // Fallback
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      // Export as JPEG with 0.85 quality to reduce payload size
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
  });
};

// Function to handle virtual room staging using Gemini API
export const stageRoom = async (
  originalImageBase64: string,
  style: StagingStyle,
  customPrompt?: string,
  maskBase64?: string
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const modelName = 'gemini-2.5-flash-image';
  
  const optimizedBase64 = await optimizeImageForApi(originalImageBase64);
  
  const baseStyleInstructions = getPromptForStyle(style);
  let finalPrompt = `CORE STAGING STYLE: ${baseStyleInstructions}\n\n`;

  if (customPrompt && customPrompt.trim()) {
    finalPrompt += `CUSTOM USER REQUIREMENTS: ${customPrompt.trim()}\n\n`;
  }

  // If a mask is provided, specifically instruct the model to use it for selective editing
  if (maskBase64) {
    finalPrompt += `IMPORTANT SELECTIVE EDITING INSTRUCTION: I have provided a second image which is a MASK. The red strokes in this mask indicate the ONLY areas you are allowed to change. You MUST keep all other parts of the room (outside the red strokes) identical to the original image. Focus your modifications solely on the indicated regions.`;
  } else {
    finalPrompt += `VARIATION NOTE: Please provide a fresh and unique creative interpretation of this ${style} design. Even if similar requests have been made before, try a different arrangement of furniture, new textures, or a unique sub-palette that still fits the style. Ensure the architectural integrity of the room is preserved.`;
  }

  try {
    const parts: any[] = [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: optimizedBase64.split(',')[1]
        }
      }
    ];

    if (maskBase64) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: maskBase64.split(',')[1]
        }
      });
    }

    parts.push({ text: finalPrompt });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts }
    });

    if (!response.candidates?.[0]?.content?.parts) {
      throw new Error("The model failed to generate a response. Please try again.");
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("Model returned feedback but no staged image.");
  } catch (error: any) {
    console.error("Gemini Staging Error:", error);
    if (error.message?.includes('500') || error.status === 500) {
      throw new Error("The AI encountered an internal snag. Try a simpler prompt or drawing smaller regions.");
    }
    throw error;
  }
};
