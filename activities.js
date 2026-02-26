const DEFAULT_DATA = {
  activities: [
    {
      id: "a_b23224d8e7c5619c83d38cd8",
      name: "Fermi Problem",
      type: "iframe",
      url: "https://fermi-questions.andrechek.com/",
      tag: "",
      seconds: null,
      steps: ["Write instructions here…"],
      autoOpen: false,
      enabled: true
    },
    {
      id: "photo_guess",
      name: "Photo Guess",
      type: "newtab",
      url: "https://www.braingle.com/trivia/photo.php",
      tag: "",
      seconds: null,
      steps: [],
      autoOpen: false,
      enabled: true
    },
    {
      id: "Rando_Question",
      name: "Random Question",
      type: "iframe",
      url: "https://faculty.washington.edu/ejslager/random-generator/index.html",
      tag: "",
      seconds: null,
      steps: [],
      autoOpen: false,
      enabled: true
    },
    {
  id: "random_fact",
  name: "Random Fact",
  type: "iframe",
  url: "https://random-fact-generator-jade.vercel.app/",
  tag: "",
  seconds: null,
  steps: [],
  autoOpen: false,
  enabled: true
    },
    {
      id: "wordle",
      name: "Wordle (Daily)",
      type: "iframe",
      url: "https://powerlanguage-wordle.github.io/",
      tag: "",
      seconds: null,
      steps: [],
      autoOpen: false,
      enabled: true
    },
    {
      id: "riddle",
      name: "Random Riddle",
      type: "riddle",
      url: "https://randomgenerator.pro/random-riddle-generator/",
      tag: "",
      seconds: null,
      steps: [],
      autoOpen: false,
      enabled: true
    },
    
    ,
    {
      id: "edquote",
      name: "EdQuote (random quote)",
      type: "iframe",
      url: "https://www.hellam.net/edquote.phtml",
      tag: "discussion",
      seconds: null,
      steps: [
        "Read the quote.",
        "Turn-and-talk: What does it mean in 1 sentence?",
        "Share one takeaway."
      ],
      autoOpen: true,
      enabled: true
    },
    {
      id: "funny_jokes",
      name: "Funny Jokes",
      type: "iframe",
      url: "https://funny-jokes.netlify.app/",
      tag: "light",
      seconds: null,
      steps: [
        "Read 2–3 jokes.",
        "Vote: funniest one."
      ],
      autoOpen: true,
      enabled: true
    },
    {
      id: "yt_video",
      name: "YouTube Video (paste link)",
      type: "iframe",
      url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      tag: "video",
      seconds: null,
      steps: [
        "Teacher: paste any YouTube link into this activity to play it in-page."
      ],
      autoOpen: false,
      enabled: true
    },
    {
      id: "yt_random_kurzgesagt",
      name: "Random Kurzgesagt",
      type: "yt_random",
      url: "UCsXVk37bltHxD1rDPwtNM8Q",
      tag: "video",
      seconds: null,
      steps: [
        "Watch a random recent Kurzgesagt video for 2–4 minutes.",
        "Students: write one fact you learned."
      ],
      autoOpen: true,
      enabled: true
    },
    {
      id: "sequence_guess",
      name: "Guess the next number",
      type: "sequence",
      url: "",
      tag: "math",
      seconds: null,
      steps: [
        "Work out the pattern.",
        "Write the next number.",
        "Reveal and explain."
      ],
      autoOpen: true,
      enabled: true
    }

    {
      id: "rps",
      name: "Rock • Paper • Scissors",
      type: "rps",
      url: "",
      tag: "",
      seconds: null,
      steps: [],
      autoOpen: false,
      enabled: true
    }
  ]
};

// Make it accessible to other scripts if needed:
//window.PHS_DEFAULT_DATA = DEFAULT_DATA;
window.PHS_ACTIVITIES_DEFAULTS = DEFAULT_DATA;
