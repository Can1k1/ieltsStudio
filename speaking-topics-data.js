/**
 * IELTS Speaking — January–August 2026 topic sets (Part 2 cue cards + Part 3 discussion).
 * Source topics from current exam preparation materials.
 */
const SPEAKING_TOPIC_SETS = [
  {
    id: 't43',
    number: 43,
    season: 'January – August 2026',
    theme: 'Smiling',
    part2: {
      id: 'sp43-p2',
      part: 'PART 2',
      label: 'Topic 43',
      subtitle: 'Occasion when many people were smiling',
      time: '1 min prep · 2 min speak',
      prepSeconds: 60,
      timeSeconds: 120,
      mainPrompt: 'Describe an occasion when you saw a lot of people smiling.',
      cues: [
        'what occasion it was',
        'where it was',
        'why they were smiling',
      ],
      tips: [
        'Cover all three bullet points — missing one limits Task Achievement.',
        'Use past tenses and one vivid detail (sound, atmosphere, who was there).',
        'Brief intro → each bullet → short closing line is enough for 2 minutes.',
        'If you run short, add how the moment made you feel.',
      ],
    },
    part3: {
      id: 'sp43-p3',
      part: 'PART 3',
      label: 'Topic 43',
      subtitle: 'Smiling',
      time: '4–5 min',
      timeSeconds: 270,
      questions: [
        'Do you think people who like to smile are more friendly?',
        'Why do most people smile in photographs?',
        'Do women smile more than men? Why?',
        'Do people smile more when they are younger or older?',
      ],
      tips: [
        'Give a clear opinion first, then one reason and a short example.',
        'Part 3 is abstract — compare groups, trends, or “it depends”.',
        'Use hedging: “Generally…”, “In many cases…”, “To some extent…”.',
        'Aim for 4–6 sentences per question, not one-word answers.',
      ],
    },
  },
  {
    id: 't53',
    number: 53,
    season: 'January – August 2026',
    theme: 'Intelligence & problem-solving',
    part2: {
      id: 'sp53-p2',
      part: 'PART 2',
      label: 'Topic 53',
      subtitle: 'Person who solved a problem in a smart way',
      time: '1 min prep · 2 min speak',
      prepSeconds: 60,
      timeSeconds: 120,
      mainPrompt: 'Describe a person who solved a problem in a smart way.',
      cues: [
        'who this person is',
        'what the problem was',
        'what solution they gave',
        'why you think it was a clever solution',
      ],
      tips: [
        'Choose someone real (friend, colleague, family) — easier to sound natural.',
        'Explain the problem clearly before the solution (examiner needs context).',
        'Use words like “ingenious”, “resourceful”, “came up with”, “figured out”.',
        'End with why it impressed you — links to “clever solution”.',
      ],
    },
    part3: {
      id: 'sp53-p3',
      part: 'PART 3',
      label: 'Topic 53',
      subtitle: 'Intelligence',
      time: '4–5 min',
      timeSeconds: 270,
      questions: [
        'Are people born clever or do they need to learn to be clever?',
        'Why are some children more intelligent than others?',
        'Do you think society needs people with different types of intelligence?',
        'Does modern society need talents of all kinds?',
        'How do children become smart at school?',
        'Why are some people well-rounded and others only good at one thing?',
      ],
      tips: [
        'Nature vs nurture questions: mention both sides, then your view.',
        '“Different types of intelligence” — examples: artistic, emotional, practical, academic.',
        'Link answers to education, parenting, or culture when possible.',
        'If a question is hard, say “That’s interesting — I’d say…” and buy thinking time.',
      ],
    },
  },
  {
    id: 't63',
    number: 63,
    season: 'January – August 2026',
    theme: 'Quiet places',
    part2: {
      id: 'sp63-p2',
      part: 'PART 2',
      label: 'Topic 63',
      subtitle: 'Quiet place',
      time: '1 min prep · 2 min speak',
      prepSeconds: 60,
      timeSeconds: 120,
      mainPrompt: 'Describe a quiet place that you like to go to.',
      cues: [
        'what place it is',
        'how often you go there and when you go there',
        'what you do there',
        'why you like this place',
      ],
      tips: [
        'Paint the place with sensory language: calm, peaceful, little noise.',
        '“How often / when” needs a routine: weekends, after work, when stressed.',
        'Contrast with noisy places to show range (city vs park, library, etc.).',
        'Keep speaking until the timer ends — expand “what you do there”.',
      ],
    },
    part3: {
      id: 'sp63-p3',
      part: 'PART 3',
      label: 'Topic 63',
      subtitle: 'Quiet places & noise',
      time: '4–5 min',
      timeSeconds: 270,
      comingSoon: true,
      questions: [
        'Why do some people prefer quiet environments?',
        'Is it difficult to find quiet places in cities today?',
        'How does noise affect people’s health or concentration?',
        'Should governments do more to reduce noise pollution?',
      ],
      tips: [
        'Official Part 3 questions for this topic may be updated later — use these for practice.',
        'Think about cities, open offices, traffic, and headphones as examples.',
        'Compare young people vs older people or urban vs rural life.',
      ],
    },
  },
];

/** Flat list for timers / legacy openSpeaking by part id */
const SPEAKING_TOPICS = SPEAKING_TOPIC_SETS.flatMap((set) => {
  const rows = [];
  if (set.part2) {
    rows.push({
      ...set.part2,
      setId: set.id,
      setNumber: set.number,
      season: set.season,
      theme: set.theme,
      topic: set.part2.mainPrompt,
    });
  }
  if (set.part3) {
    rows.push({
      ...set.part3,
      setId: set.id,
      setNumber: set.number,
      season: set.season,
      theme: set.theme,
      topic: set.part3.subtitle,
    });
  }
  return rows;
});
