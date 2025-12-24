import express from "express";
import Sentiment from "sentiment";

const router = express.Router();
const sentiment = new Sentiment();

const EMOTION_KEYWORDS = {
  joy: ["happy", "joy", "excited", "grateful", "grace", "love", "glad", "bright", "peaceful"],
  calm: ["calm", "content", "okay", "fine", "steady", "soft", "chill", "relaxed", "balanced"],
  sadness: ["sad", "down", "blue", "lonely", "tired", "exhausted", "heavy", "cry", "loss", "hopeless", "worthless"],
  anger: ["angry", "mad", "frustrated", "upset", "irritated", "annoyed", "rage", "furious", "resent"],
  fear: ["anxious", "scared", "afraid", "worried", "nervous", "panic", "uneasy", "uncertain", "terrified"],
};

// Emotional subtypes (feelings wheel detail) — expanded per feelings wheel categories
const EMOTION_SUBTYPES = {
  anger: {
    frustrated: ["frustrated", "frustration", "stuck", "blocked", "can't figure", "helpless"],
    irritated: ["irritated", "irritation", "annoyed", "bothered"],
    annoyed: ["annoyed", "peeved", "irritated"],
    enraged: ["rage", "enraged", "furious", "livid", "explosive"],
    resentful: ["resent", "resentful", "bitter", "betrayed"],
    bitter: ["bitter", "resentful", "sour"],
    hostile: ["hostile", "antagonistic", "aggressive"],
    jealous: ["jealous", "envy", "envious"],
  },
  sadness: {
    lonely: ["lonely", "alone", "isolated", "left out", "abandoned", "forgotten"],
    disappointed: ["disappointed", "let down", "letdown", "failed", "regretful", "regret"],
    hopeless: ["hopeless", "no point", "give up", "can't go on", "meaningless", "worthless"],
    discouraged: ["discouraged", "disheartened", "demoralized"],
    grief_stricken: ["grief", "grieving", "heartbroken", "mourning", "devastated"],
    ashamed: ["ashamed", "embarrassed", "humiliated"],
    guilty: ["guilty", "remorse", "sorry for", "regretful"],
    regretful: ["regretful", "regret", "should have", "wish I had"],
  },
  fear: {
    anxious: ["anxious", "anxiety", "anxiousness"],
    worried: ["worried", "worry", "concerned"],
    nervous: ["nervous", "jitters", "butterflies"],
    insecure: ["insecure", "unsure", "inadequate", "not good enough"],
    overwhelmed: ["overwhelmed", "overwhelm", "too much", "can't handle"],
    helpless: ["helpless", "powerless", "can't do anything"],
    scared: ["scared", "afraid", "terrified"],
    panicked: ["panic", "panicked", "panicking"],
  },
  joy: {
    content: ["content", "contentment", "satisfied", "satisfied"],
    proud: ["proud", "pride", "accomplished"],
    excited: ["excited", "thrilled", "pumped", "energized"],
    playful: ["playful", "funny", "silly"],
    grateful: ["grateful", "thankful", "blessed"],
    hopeful: ["hopeful", "optimistic", "hope"],
    peaceful: ["peaceful", "calm", "serene"],
    satisfied: ["satisfied", "fulfilled"] ,
  },
  powerful: {
    brave: ["brave", "courageous", "undaunted"],
    capable: ["capable", "competent", "able"],
    determined: ["determined", "resolute", "decided"],
    motivated: ["motivated", "driven", "energized"],
    inspired: ["inspired", "inspirational"],
    successful: ["successful", "victorious", "triumphant"],
    respected: ["respected", "valued", "esteemed"],
  },
  peaceful: {
    calm: ["calm", "tranquil", "relaxed"],
    relaxed: ["relaxed", "laid back", "at ease"],
    safe: ["safe", "secure", "protected"],
    balanced: ["balanced", "centered", "grounded"],
    accepted: ["accepted", "included"],
    centered: ["centered", "grounded"] ,
  },
  disgusted: {
    uncomfortable: ["uncomfortable", "uneasy"],
    repulsed: ["repulsed", "disgusted", "grossed out"],
    judgmental: ["judgmental", "critical"],
    uneasy: ["uneasy", "off"],
    disapproving: ["disapproving", "disapprove"] ,
  },
  surprised: {
    shocked: ["shocked", "shocking"],
    confused: ["confused", "perplexed"],
    curious: ["curious", "interested"],
    amazed: ["amazed", "astonished", "wow"],
    startled: ["startled", "jumpy"] ,
  },
};

const BASE_PALETTES = {
  joy: ["#FFB347", "#FF7A7A", "#FFD166"],
  calm: ["#75C9C8", "#5E8BFF", "#B8E1FF"],
  sadness: ["#4D6DE3", "#1B1F3B", "#7A8BA3"],
  anger: ["#E63946", "#F3722C", "#9B2226"],
  fear: ["#9E77ED", "#2D2A4A", "#6C63FF"],
  mixed: ["#F4A261", "#2A9D8F", "#8AB17D"],
};

// Support resources to return when urgent help may be needed
const SUPPORT_RESOURCES = [
  { label: "US: National Suicide & Crisis Lifeline", url: "tel:988", note: "Call or text 988 (US)" },
  { label: "Samaritans (UK & ROI)", url: "https://www.samaritans.org/", note: "Call +44 (0)8457 90 90 90 or see website" },
  { label: "Befrienders Worldwide", url: "https://www.befrienders.org/", note: "International directory of helplines" },
  { label: "WHO: Mental Health", url: "https://www.who.int/teams/mental-health-and-substance-use", note: "Global mental health resources" },
];

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Detect emotional subtypes within a detected emotion
function detectSubtypes(emotion, text) {
  const lower = text.toLowerCase();
  const subtypeMap = EMOTION_SUBTYPES[emotion] || {};
  const detected = [];

  Object.entries(subtypeMap).forEach(([subtype, keywords]) => {
    const hits = keywords.filter((kw) => lower.includes(kw)).length;
    if (hits > 0) {
      detected.push({ subtype, hits, confidence: Math.min(1, hits / keywords.length) });
    }
  });

  // Return top 2 subtypes by hits
  return detected.sort((a, b) => b.hits - a.hits).slice(0, 2);
}

// Detect explicit self-harm / suicidal language. Returns severity and matched phrases.
function detectSelfHarmIndicators(text) {
  // Normalize text: lowercase, remove punctuation except apostrophes, collapse spaces
  const lower = (text || "").toLowerCase();
  const normalized = lower.replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();

  // Phrase lists grouped by severity. Ordered so explicit suicidal intent is high.
  const highPhrases = [
    "kill myself",
    "end my life",
    "i want to end my life",
    "i want to die",
    "i wanna die",
    "i want to kill myself",
    "i'll kill myself",
    "i will kill myself",
    "i'll end it",
    "i will end it",
    "i want to end it",
  ];

  const mediumPhrases = [
    "no point in living",
    "no point",
    "can't go on",
    "cant go on",
    "i can't go on",
    "i cant go on",
    "i want to die by suicide",
    "suicidal",
  ];

  const lowPhrases = [
    "hurt myself",
    "self harm",
    "self-harm",
    "cut myself",
    "cutting myself",
  ];

  const matches = [];
  const addMatches = (list) => {
    list.forEach((p) => {
      if (normalized.includes(p) && !matches.includes(p)) matches.push(p);
    });
  };

  addMatches(highPhrases);
  addMatches(mediumPhrases);
  addMatches(lowPhrases);

  let severity = null;
  if (matches.some((m) => highPhrases.includes(m))) severity = "high";
  else if (matches.some((m) => mediumPhrases.includes(m))) severity = "medium";
  else if (matches.length) severity = "low";

  return { found: matches.length > 0, severity, matches };
}

function scoreEmotion(text = "") {
  const lower = text.toLowerCase();

  // Keyword counts and matches
  const details = Object.entries(EMOTION_KEYWORDS).map(([emotion, words]) => {
    const matches = words.filter((w) => lower.includes(w));
    return { emotion, hits: matches.length, matches };
  });

  // Sentiment analysis (gives an integer score, positive = positive sentiment)
  const sentimentResult = sentiment.analyze(text || "");
  const sentimentScore = sentimentResult.score; // can be negative or positive

  // Combine keyword hits and sentiment to produce emotion scores
  // Start with raw hits normalized by a small factor, then adjust using sentiment polarity
  const scores = details.map((d) => {
    let score = d.hits; // base
    // If sentiment is strongly positive, boost joy; negative boosts sadness/fear/anger
    if (sentimentScore > 1 && d.emotion === "joy") score += Math.min(2, sentimentScore / 2);
    if (sentimentScore < -1 && (d.emotion === "sadness" || d.emotion === "fear" || d.emotion === "anger")) score += Math.min(2, Math.abs(sentimentScore) / 2);
    return { emotion: d.emotion, score, matches: d.matches };
  });

  const sorted = scores.sort((a, b) => b.score - a.score);
  const top = sorted[0] || { emotion: "mixed", score: 0 };
  const next = sorted[1] || { score: 0 };

  const isMixed = !top || top.score === 0 || (next && Math.abs(next.score - top.score) < 0.75);
  const emotion = isMixed ? "mixed" : top.emotion;

  // Confidence based on relative gap and total signal
  const totalSignal = scores.reduce((s, x) => s + x.score, 0);
  const gap = top.score - (next.score || 0);
  const confidence = clamp(0.15 + Math.min(0.85, (gap / (1 + totalSignal)) + Math.min(0.6, totalSignal / 6)), 0.15, 0.99);

  // Intensity derived from top score and absolute sentiment magnitude
  const rawIntensity = Math.min(1, (top.score / 4) + Math.min(1, Math.abs(sentimentScore) / 6));
  const intensity = clamp(0.2 + rawIntensity * 0.75, 0.2, 0.95);

  const palette = BASE_PALETTES[emotion] || BASE_PALETTES.mixed;

  const matchedKeywords = sorted.flatMap((s) => s.matches.map((m) => ({ emotion: s.emotion, word: m })));

  // Detect emotional subtypes (feelings wheel detail)
  const subtypes = emotion !== "mixed" ? detectSubtypes(emotion, text) : [];

  const explanation = {
    sentimentScore,
    matchedKeywords,
    topCandidates: sorted.slice(0, 3).map((s) => ({ emotion: s.emotion, score: s.score })) ,
  };

  return { emotion, intensity, palette, confidence, explanation, subtypes };
}

  function getCopingStrategies(emotion, intensity) {
    // intensity is 0.2 - 0.95; classify low/med/high
    const level = intensity >= 0.7 ? "high" : intensity >= 0.45 ? "medium" : "low";

    const strategies = {
      joy: [
        { title: "Savor the moment", description: "Take 60 seconds to notice what's making you feel good. Name three details out loud.", minutes: 1 },
        { title: "Share the feeling", description: "Tell someone briefly about something good that happened — it strengthens connection.", minutes: 2 },
      ],
      calm: [
        { title: "Breathing reset", description: "Try 4-4-6 breathing: inhale 4s, hold 4s, exhale 6s — repeat 4 times.", minutes: 3 },
        { title: "Gentle movement", description: "Stand and stretch or take a 5-minute walk to keep balance and clarity.", minutes: 5 },
      ],
      sadness: [
        { title: "Grounding 5-4-3-2-1", description: "Name 5 things you can see, 4 you can touch, 3 you can hear, 2 you can smell, 1 you can taste.", minutes: 3 },
        { title: "Soothing breakpoint", description: "If feeling very low, try a short self-soothing routine: warm drink, comfy seat, slow breathing.", minutes: 10 },
        { title: "Reach out", description: "Consider messaging a trusted friend or professional when intensity is high.", minutes: 5 },
      ],
      anger: [
        { title: "Pause & breathe", description: "Step away for a minute, do 6 slow breaths focusing on exhalation.", minutes: 2 },
        { title: "Channel energy", description: "Do a short physical activity (walk, push-ups) to release tension safely.", minutes: 5 },
      ],
      fear: [
        { title: "Box breathing", description: "Inhale 4s, hold 4s, exhale 4s, hold 4s — repeat 4 times to calm the nervous system.", minutes: 3 },
        { title: "Reality check", description: "Name evidence that supports and contradicts the fear — write two lines for each.", minutes: 5 },
      ],
      mixed: [
        { title: "Check-in journaling", description: "Spend 5 minutes writing what you feel and one small next step you can take.", minutes: 5 },
        { title: "Mini self-care", description: "Pick one kind thing to do for yourself now (hydrate, step outside, call someone).", minutes: 5 },
      ],
    };

    // select base set
    const base = strategies[emotion] || strategies.mixed;

    // Tailor suggestions by level: for high intensity, prioritize grounding and reach-out
    if (level === "high") {
      const urgent = [
        { title: "Grounding exercise", description: "If you feel overwhelmed, use grounding (5-4-3-2-1) or box breathing now.", minutes: 3 },
        { title: "Contact support", description: "Consider reaching out to a trusted person or a professional. If immediate danger, call local emergency services.", minutes: 5 },
      ];
      // avoid duplicates
      const merged = [...urgent, ...base].slice(0, 4);
      return merged;
    }

    // medium/low: return first two strategies
    return base.slice(0, 3);
  }

router.post("/", (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text is required" });
  }

  const analysis = scoreEmotion(text);

  // Detect self-harm indicators
  const selfHarm = detectSelfHarmIndicators(text);
  if (selfHarm.found) {
    // include matches in explanation for transparency
    analysis.explanation.selfHarmMatches = selfHarm.matches;
    analysis.explanation.selfHarmSeverity = selfHarm.severity;
  }

  // Safety/careful language: not a clinical diagnosis
  const response = {
    ...analysis,
    summary: `Detected ${analysis.emotion} (confidence ${Math.round(analysis.confidence * 100)}%) with intensity ${analysis.intensity.toFixed(2)}`,
    note: "This is an automated analysis and not a substitute for professional mental health care.",
  };

  // Add supportive resource prompt when sadness or fear is prominent and intense
  // If self-harm language detected — show support resources (explicit risk)
  if (selfHarm.found) {
    response.support = {
      message:
        selfHarm.severity === "high"
          ? "We detected language that may indicate risk of self-harm or suicidal thinking. If you are in immediate danger, contacting local emergency services or a crisis line can help."
          : "We detected language that may indicate significant distress. Reaching out to a trusted person or a crisis line may help.",
      severity: selfHarm.severity,
      resources: SUPPORT_RESOURCES,
    };
  } else if ((analysis.emotion === "sadness" || analysis.emotion === "fear") && analysis.intensity >= 0.7) {
    // High intensity but no explicit self-harm language: gentle suggestion without automatically listing hotlines
    response.support = {
      message: "You appear to be experiencing intense feelings. Reaching out to someone you trust or a mental health professional may help.",
      severity: "elevated",
    };
  }

  // Quiet, protective disclaimer line
  response.disclaimer = "Soulscape isn’t a replacement for support—just a place to pause.";

  // Add coping strategies tailored to detected emotion/intensity
  response.coping = getCopingStrategies(analysis.emotion, analysis.intensity);

  return res.json(response);
});

export default router;

