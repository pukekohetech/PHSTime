// activities.js — default activity list for Brain Breaks
// This MUST define window.PHS_ACTIVITIES_DEFAULTS so brainbreak.js can read it.

window.PHS_ACTIVITIES_DEFAULTS = {
  "activities": [
    {
      "id": "edquote",
      "name": "EdQuote (random quote)",
      "type": "iframe",
      "url": "https://www.hellam.net/edquote.phtml",
      "tag": "teacher",
      "seconds": null,
      "steps": [
        "Click for a new quote. Discuss: Do you agree? Why/why not?"
      ],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "funny_jokes",
      "name": "Funny Jokes",
      "type": "iframe",
      "url": "https://funny-jokes.netlify.app/",
      "tag": "light",
      "seconds": null,
      "steps": [
        "Pick one joke. Deliver it with confidence. Rate it 1\u20135 \ud83d\ude04"
      ],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "yt_video",
      "name": "YouTube Video",
      "type": "newtab",
      "url": "https://youtu.be/oHg5SJYRHA0?si=V-eRjU8mdrLS8Np5",
      "tag": "video",
      "seconds": null,
      "steps": [
        "Teacher: edit this activity and paste any YouTube link."
      ],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "yt_random_kurzgesagt",
      "name": "Random Kurzgesagt video",
      "type": "newtab",
      "url": "https://youtube.com/@kurzgesagt?si=SKKHGl3YNNyOKsFi",
      "tag": "video",
      "seconds": null,
      "steps": [
        "Watch 2\u20134 minutes. Share one interesting fact you heard."
      ],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "sequence_guess",
      "name": "Guess the next number (sequence)",
      "type": "sequence",
      "url": "",
      "tag": "math",
      "seconds": null,
      "steps": [
        "Students guess the next number. Reveal and explain the rule."
      ],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "a_b23224d8e7c5619c83d38cd8",
      "name": "Fermi Problem",
      "type": "iframe",
      "url": "https://fermi-questions.andrechek.com/",
      "tag": "",
      "seconds": null,
      "steps": [
        "Make an educated guess at the amount of zeros\u2026"
      ],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "photo_guess",
      "name": "Photo Guess",
      "type": "newtab",
      "url": "https://www.braingle.com/trivia/photo.php",
      "tag": "",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "Rando_Question",
      "name": "Random Question",
      "type": "iframe",
      "url": "https://faculty.washington.edu/ejslager/random-generator/index.html",
      "tag": "",
      "seconds": null,
      "steps":["look at thr title" ],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "random_fact",
      "name": "Random Fact",
      "type": "iframe",
      "url": "https://random-fact-generator-jade.vercel.app/",
      "tag": "",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "wordle",
      "name": "Wordle (Daily)",
      "type": "iframe",
      "url": "https://powerlanguage-wordle.github.io/",
      "tag": "",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "riddle",
      "name": "Random Riddle",
      "type": "iframe",
      "url": "https://fungenerators.com/random/text/riddle/",
      "tag": "",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    },
    {
      "id": "rps",
      "name": "Rock \u2022 Paper \u2022 Scissors",
      "type": "rps",
      "url": "",
      "tag": "",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    }
  ]
};
