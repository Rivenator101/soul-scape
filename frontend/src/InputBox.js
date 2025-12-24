import { useState } from "react";

export default function InputBox({ onEmotionDetected }) {
  const [userText, setUserText] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    const text = userText.trim();
    if (!text) return;

    try {
      setSending(true);
      const response = await fetch("/api/analyzeEmotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error("Failed to analyze emotion");
      const data = await response.json();
      onEmotionDetected({ ...data, text });
      setUserText("");
    } catch (err) {
      console.error(err);
      alert("Error analyzing emotion. Make sure backend is running!");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="input-card">
      <p className="label">Describe how you feel</p>
      <textarea
        value={userText}
        onChange={(e) => setUserText(e.target.value)}
        placeholder='Type a few words. Example: "I feel hopeful but tired after a long day."'
        rows={4}
        className="input"
      />
      <button className="primary" onClick={handleSubmit} disabled={sending}>
        {sending ? "Listening..." : "Create soulscape"}
      </button>
    </div>
  );
}
