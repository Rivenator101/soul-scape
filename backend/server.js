import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import analyzeEmotionRoute from "./routes/analyzeEmotion.js";
import feedbackRoute from "./routes/feedback.js";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

app.use("/api/analyzeEmotion", analyzeEmotionRoute);
app.use("/api/feedback", feedbackRoute);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));