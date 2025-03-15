const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors());

// Get API key from environment variable (you can also load it from process.env for security reasons)
const GEMINI_API_KEY = "AIzaSyDJjL2hvEGK31fz7UpCQjNmrd2uNRoiP1w";
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY environment variable not set.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// SSE Endpoint
app.get("/recipeStream", (req, res) => {
  const ingredients = req.query.ingredients;
  const mealType = req.query.mealType;
  const cuisine = req.query.cuisine;
  const cookingTime = req.query.cookingTime;
  const complexity = req.query.complexity;

  console.log("Received query parameters:", req.query);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Function to send messages
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

  const promptText = prompt.join(" ");

  fetchGeminiCompletions(promptText, sendEvent);

  // Clear interval and close connection on client disconnect
  req.on("close", () => {
    console.log("Client disconnected");
    res.end();
  });
});

async function fetchGeminiCompletions(prompt, callback) {
  try {
    console.log("Sending prompt to Gemini API:", prompt);

    const response = await model.generateContent(prompt);
    console.log("Gemini API Response:", response);

    if (response?.response?.candidates?.length > 0) {
      const candidates = response.response.candidates;
      console.log("Candidates array:", JSON.stringify(candidates, null, 2));

      // Extract the recipe text
      const recipe = candidates[0]?.content?.parts[0]?.text;

      if (recipe) {
        console.log("Extracted recipe text:", recipe);

        // Split recipe into smaller chunks for SSE
        const chunks = recipe.match(/(.{1,2000})/g);
        chunks.forEach((chunk, index) => {
          const action = index === chunks.length - 1 ? "close" : "chunk";
          callback({ action, chunk });
        });
      } else {
        console.error("No 'text' property found in the first candidate.");
        callback({ action: "close", error: "No valid recipe text found." });
      }
    } else {
      console.error("Candidates array is empty or undefined.");
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
