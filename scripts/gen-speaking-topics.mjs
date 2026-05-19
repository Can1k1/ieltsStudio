import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const season = 'January – August 2026';
const tipsP2 = [
  'Cover every bullet point — missing one hurts fluency/coherence scores.',
  'Use past tenses for “describe” stories; add one vivid detail per bullet.',
  'Structure: short intro → each bullet → one-line conclusion.',
];
const tipsP3 = [
  'State your view first, then a reason and a short example.',
  'Aim for 4–6 sentences per question — Part 3 is discussion, not yes/no.',
  'Use hedging: “Generally…”, “In many cases…”, “It depends on…”.',
];

function set(n, theme, p2, p3, extra = {}) {
  return {
    id: `t${n}`,
    number: n,
    season,
    theme,
    part2: {
      id: `sp${n}-p2`,
      part: 'PART 2',
      label: `Topic ${n}`,
      subtitle: p2.subtitle,
      time: '1 min prep · 2 min speak',
      prepSeconds: 60,
      timeSeconds: 120,
      mainPrompt: p2.mainPrompt,
      cues: p2.cues,
      tips: p2.tips || [...tipsP2],
    },
    part3: {
      id: `sp${n}-p3`,
      part: 'PART 3',
      label: `Topic ${n}`,
      subtitle: p3.subtitle,
      time: '4–5 min',
      timeSeconds: 270,
      questions: p3.questions,
      tips: p3.tips || [...tipsP3],
      ...(p3.comingSoon ? { comingSoon: true } : {}),
    },
    ...extra,
  };
}

const TOPICS = [
  set(43, 'Smiling', {
    subtitle: 'Occasion when many people were smiling',
    mainPrompt: 'Describe an occasion when you saw a lot of people smiling.',
    cues: ['what occasion it was', 'where it was', 'why they were smiling'],
  }, {
    subtitle: 'Smiling',
    questions: [
      'Do you think people who like to smile are more friendly?',
      'Why do most people smile in photographs?',
      'Do women smile more than men? Why?',
      'Do people smile more when they are younger or older?',
    ],
  }),
  set(44, 'Advice', {
    subtitle: 'Advice you gave',
    mainPrompt: 'Describe a time when you gave advice to others.',
    cues: ['who you gave advice to', 'what the situation was', 'what advice you gave', 'what the result was'],
  }, {
    subtitle: 'Advice',
    questions: [
      'What problems can people face if they ask many different people for advice?',
      'Why do some people like to ask others for advice on almost everything?',
      'In general, what kind of person is most suitable for giving advice to others?',
      'Should people prepare before giving advice?',
      'Is it good to ask advice from strangers online?',
      'What are the personalities of people whose job is to give advice to others?',
    ],
  }),
  set(45, 'Apps & programs', {
    subtitle: 'App or program',
    mainPrompt: 'Describe an app or program on your computer or phone.',
    cues: ['what app or program it is', 'when and where you found it', 'how you use it', 'how you feel about it'],
  }, {
    subtitle: 'Apps or programs',
    questions: [
      'What are the drawbacks of having too many apps?',
      'Why do some people not like using apps?',
      'What are the most and the least popular apps in your country?',
      'What kind of apps do you have on your phone?',
      'What are the differences between old and young people when using apps?',
    ],
  }),
  set(46, 'Working abroad', {
    subtitle: 'Country to work or live in for a short period',
    mainPrompt: 'Describe a country in which you would like to work or live for a short period of time.',
    cues: ['what country or city it is', 'how you know about it', 'what type of work you would like to do there', 'why you would like to work in this country'],
  }, {
    subtitle: 'Working abroad, travelling',
    questions: [
      'Why do people like travelling?',
      'What jobs can people do abroad for a short period of time?',
      'Is it good that now people have an opportunity to work abroad?',
    ],
  }),
  set(47, 'Old things & museums', {
    subtitle: 'Thing your family has kept for a long time',
    mainPrompt: 'Describe an important old thing that your family has kept for a long time.',
    cues: ['what it is', 'how your family first got this thing', 'how long your family has kept it', 'why this thing is important to your family'],
  }, {
    subtitle: 'Old things, museums',
    questions: [
      'What are the differences between the things that people keep today and the things that people kept in the past?',
      'As well as family photographs, what are some other things that people keep in their family for a long time?',
      'In your culture, what sorts of things do people pass down from generation to generation?',
      'What kinds of things are kept in museums?',
      "What's the influence of technology on museums?",
    ],
  }),
  set(48, 'Transport & pollution', {
    subtitle: 'Trip by bike, car or motorbike you want to have',
    mainPrompt: 'Describe a long bike, motorbike, or car trip that you would like to take.',
    cues: ['when you want to go', 'where you want to go', 'how long it will take you', 'why it is interesting'],
  }, {
    subtitle: 'Transportation, air pollution',
    questions: [
      'How are transportation systems in rural and urban areas different?',
      'Which mode of transport is more popular in your country, a bicycle or a car?',
      'Do you think air pollution comes mostly from mobile vehicles?',
      'Do you think people need to change the way of transportation drastically to protect the environment?',
    ],
  }),
  set(49, 'Shopping', {
    subtitle: 'Shop you often visit',
    mainPrompt: 'Describe a shop you often visit.',
    cues: ['what shop it is, where it is', 'what it sells', 'why you like it'],
  }, {
    subtitle: 'Shopping',
    questions: [
      "Do you think that people buy a lot of things that they don't need?",
      'Do you often buy more than you expected?',
    ],
  }),
  set(50, 'Imagination', {
    subtitle: 'Time you needed imagination',
    mainPrompt: 'Describe a time you needed to use your imagination.',
    cues: ['what you did using imagination', 'when it was', 'whether it was easy or difficult', 'how you felt'],
  }, {
    subtitle: 'Imagination',
    questions: [
      'What kind of jobs require imagination?',
      'Do scientists need imagination in their work?',
      'Do you think adults can have lots of imagination?',
      "What subjects are helpful for children's imagination?",
    ],
  }),
  set(51, 'Films', {
    subtitle: 'Film you watched and enjoyed',
    mainPrompt: 'Describe a film you watched and enjoyed.',
    cues: ['what the film was about', 'when and where you watched it', 'why you liked it and why you want to watch it again'],
  }, {
    subtitle: 'Films',
    questions: [
      'What makes a movie a blockbuster?',
      'Are actors and actresses important to movies?',
      'Do you think films with famous actors or actresses are more likely to become successful films?',
      'What kinds of movies are successful in your country?',
      'Do people in your country still like to go to a cinema?',
      'Where do people watch movies?',
      'Do people in your country prefer to watch domestic movies or foreign movies?',
      'Do you think only well-known directors can create the best movies?',
    ],
  }),
  set(52, 'Stories', {
    subtitle: 'Story you read recently',
    mainPrompt: 'Describe a story you read recently.',
    cues: ['what it is about', 'when you read it', 'whether you liked it', 'what you learned from it'],
  }, {
    subtitle: 'Stories',
    questions: [
      'Why do most children like listening to stories before bedtime?',
      'Is a good storyline important for a movie?',
      'Why do children like hearing the same bedtime story?',
    ],
  }),
  set(53, 'Intelligence & problem-solving', {
    subtitle: 'Person who solved a problem in a smart way',
    mainPrompt: 'Describe a person who solved a problem in a smart way.',
    cues: ['who this person is', 'what the problem was', 'what solution they gave', 'why you think it was a clever solution'],
    tips: [
      'Choose someone real — easier to sound natural.',
      'Explain the problem before the solution.',
      'Use: ingenious, resourceful, figured out, came up with.',
    ],
  }, {
    subtitle: 'Intelligence',
    questions: [
      'Are people born clever or do they need to learn to be clever?',
      'Why are some children more intelligent than others?',
      'Do you think society needs people with different types of intelligence?',
      'Does modern society need talents of all kinds?',
      'How do children become smart at school?',
      'Why are some people well-rounded and others only good at one thing?',
    ],
  }),
  set(54, 'Environmental protection', {
    subtitle: 'Person who encouraged you to protect nature',
    mainPrompt: 'Describe a person who encouraged you to protect the nature.',
    cues: ['who this person is', 'how this person encouraged you', 'what this person encouraged you to do', 'how you feel about this person'],
  }, {
    subtitle: 'Environmental protection',
    questions: [
      'How can parents teach their children to protect nature?',
      'Should schools teach children to get close to nature?',
      'Do you think there should be laws to protect nature?',
    ],
  }),
  set(55, 'Spending & saving', {
    subtitle: 'Item on which you spent more than expected',
    mainPrompt: 'Describe an occasion when you paid more than expected.',
    cues: ['what you bought', 'how much you paid', 'why you bought it', 'why you paid more'],
  }, {
    subtitle: 'Spending and saving money',
    questions: [
      'What do young people spend money on?',
      'Is it good and necessary to teach children to save money?',
      'Do you think it is important to save money?',
      "Do you think that people buy a lot of things that they don't need?",
    ],
  }),
  set(56, 'Helping others', {
    subtitle: 'Person who often helps others',
    mainPrompt: 'Describe a person who often helps others.',
    cues: ['who this person is', 'how you know this person', 'how this person helps you', 'why you think this person is helpful'],
  }, {
    subtitle: 'Helping others',
    questions: [
      'What can children help parents with?',
      'In your view, should children be taught to help others?',
      'Should children help their parents with household chores?',
      'What kind of help do people need when looking for a new job?',
      'Who should people ask for help, colleagues or family members?',
    ],
  }),
  set(57, 'Technology & communication', {
    subtitle: "Piece of technology you'd like to own (not a phone)",
    mainPrompt: 'Describe a piece of technology (not a phone) that you would like to own.',
    cues: ['what it is', 'how you knew it', 'how much it costs', "why you'd like to own it"],
  }, {
    subtitle: 'Technology, communication',
    questions: [
      'What are the differences between talking with friends online and face-to-face?',
      'What technology do people currently use?',
      'Does technological development have a negative impact on communication among people?',
      'Do you think technology unites or separates people?',
      "What effects does technology have on people's relationships?",
      'What are the differences between the technology of the past and that of today?',
      'What are the differences between making friends in real life and online?',
    ],
  }),
  set(58, 'Music events', {
    subtitle: "Music event you didn't like",
    mainPrompt: "Describe a music event that you didn't enjoy.",
    cues: ['what it was', 'who you went with', 'why you went there', "why you didn't like it"],
  }, {
    subtitle: 'Music events',
    questions: ['What kind of music events do people like today?'],
  }),
  set(59, 'Encouraging others', {
    subtitle: "Encouraging someone to do what they didn't want to do",
    mainPrompt: "Describe a time when you encouraged someone to do something that they didn't want to do.",
    cues: ['who this person is', 'what you encouraged them to do', 'how this person reacted', 'why you encouraged this person to do it'],
  }, {
    subtitle: 'Encouraging others',
    questions: [
      'Is the role of a leader important in a group?',
      'How can leaders encourage employees?',
      'When should parents encourage their children?',
      'Do you think some people are better than others at persuading?',
      'What kind of encouragement should parents give?',
    ],
  }),
  set(60, 'Learning new things', {
    subtitle: 'Friend who learned something new',
    mainPrompt: 'Describe one of your friends who learned something new (not from a teacher).',
    cues: ['who this person is', 'what this person learned', 'why they learned it', 'whether it would be easier to learn from a teacher'],
  }, {
    subtitle: 'Learning new things',
    questions: [
      'Do you think learning many subjects at one time is better or learning one subject is better?',
      'Do you think learning many subjects is beneficial to your work?',
      'Do you think all teachers should have entertaining teaching styles?',
      'Should teachers make lessons fun?',
      'Is it important for people to learn new skills all life long?',
      'Do you think enterprises should provide training for their employees?',
    ],
  }),
  set(61, 'Making plans', {
    subtitle: 'Person who makes plans a lot',
    mainPrompt: 'Describe a person who makes plans a lot and is good at planning.',
    cues: ['who this person is', 'how you knew this person', 'what plans this person makes', 'how you feel about this person'],
  }, {
    subtitle: 'Making plans',
    questions: [
      'In general, do you think planning is important?',
      'Do you think everyone in your country makes everyday plans?',
      'Do you think children should plan their future careers?',
      'Should children ask their teachers or parents for advice when making plans?',
      'What activities do we need to plan ahead?',
      'Is making study plans popular among young people?',
      "Do you think choosing a college major is closely related to a person's future career?",
    ],
  }),
  set(62, 'Drawing & museums', {
    subtitle: 'Child who loves drawing or painting',
    mainPrompt: 'Describe a child who loves drawing or painting.',
    cues: ['who this child is', 'how you knew him or her', 'how often he or she draws or paints', 'why he or she likes drawing or painting'],
  }, {
    subtitle: 'Drawing, museums',
    questions: [
      'What is the right age for a child to learn drawing?',
      'Why do most children draw more often than adults do?',
      'Why do some people visit galleries or museums instead of viewing artworks online?',
      'Do you think galleries and museums should be free of charge?',
      'How do artworks inspire people?',
    ],
  }),
  set(63, 'Quiet places', {
    subtitle: 'Quiet place',
    mainPrompt: 'Describe a quiet place that you like to go to.',
    cues: ['what place it is', 'how often you go there and when you go there', 'what you do there', 'why you like this place'],
  }, {
    subtitle: 'Quiet places & noise',
    comingSoon: true,
    questions: [
      'Why do some people prefer quiet environments?',
      'Is it difficult to find quiet places in cities today?',
      "How does noise affect people's health or concentration?",
      'Should governments do more to reduce noise pollution?',
    ],
    tips: [
      'Official Part 3 questions for this topic may be updated later — use these for practice.',
      'Think about cities, open offices, traffic, and headphones as examples.',
    ],
  }),
];

const out = `/**
 * IELTS Speaking — January–August 2026 topic sets (Part 2 cue cards + Part 3 discussion).
 * Topics 43–63 from current exam preparation materials.
 */
const SPEAKING_TOPIC_SETS = ${JSON.stringify(TOPICS, null, 2)};

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
`;

writeFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'speaking-topics-data.js'), out);
console.log('Wrote', TOPICS.length, 'topic sets');
