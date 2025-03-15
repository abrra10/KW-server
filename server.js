const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config(); // Load environment variables

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors());

// Get API key from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY environment variable not set.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// SSE Endpoint
app.get("/recipeStream", (req, res) => {
  const { ingredients, mealType, cuisine, cookingTime, complexity } = req.query;

  console.log("Received query parameters:", req.query);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const prompt = [
    "Generate a recipe based on the following details:",
    `[Ingredients: ${ingredients}]`,
    `[Meal Type: ${mealType}]`,
    `[Cuisine Preference: ${cuisine}]`,
    `[Cooking Time: ${cookingTime}]`,
    `[Complexity: ${complexity}]`,
    "Provide the recipe in the following structured format and avoid adding notes, equipment, or serving methods:",
    "[Provide a creative and suitable name for the recipe on the first line]",
    "- Ingredients: [List all the ingredients in bullet points.]",
    "- Steps: [Provide a concise, numbered step-by-step guide for preparation and cooking.]",
    "Ensure the response is short and adheres strictly to this format.",
  ];

  fetchGeminiCompletions(prompt.join(" "), sendEvent);

  req.on("close", () => {
    console.log("Client disconnected");
    res.end();
  });
});

async function fetchGeminiCompletions(prompt, callback) {
  try {
    console.log("Sending prompt to Gemini API:", prompt);
    const response = await model.generateContent(prompt);

    if (response?.response?.candidates?.length > 0) {
      const candidates = response.response.candidates;
      const recipe = candidates[0]?.content?.parts[0]?.text;

      if (recipe) {
        const chunks = recipe.match(/(.{1,2000})/g);
        chunks.forEach((chunk, index) => {
          const action = index === chunks.length - 1 ? "close" : "chunk";
          callback({ action, chunk });
        });
      } else {
        callback({ action: "close", error: "No valid recipe text found." });
      }
    } else {
      callback({ action: "close", error: "No valid candidates in response." });
    }
  } catch (error) {
    console.error("Error during Gemini API request:", error);
    callback({ action: "close", error: error.message });
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
