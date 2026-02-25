5// activities.js

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
      type: "iframe",
      url: "https://randomgenerator.pro/random-riddle-generator/",
      tag: "",
      seconds: null,
      steps: [],
      autoOpen: false,
      enabled: true
    },
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
