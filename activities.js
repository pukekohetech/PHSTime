// activities.js — default activity list for Brain Breaks
// This MUST define window.PHS_ACTIVITIES_DEFAULTS so brainbreak.js can read it.

window.PHS_ACTIVITIES_DEFAULTS = {
  "activities": [

    /* ================= ONLINE / INTERACTIVE ================= */

    {
      "id": "charades",
      "name": "Charades",
      "type": "newtab",
      "url": "https://randomwordgenerator.com/charades.php",
      "tag": "game",
      "seconds": null,
      "steps": [
        "Two players face away from the board.",
        "Teams describe the word without saying it."
      ],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "scatogories",
      "name": "Scatogories",
      "type": "newtab",
      "url": "https://swellgarfo.com/scattergories/",
      "tag": "game",
      "seconds": null,
      "steps": [
        "Be the first to name something for each category using the letter."
      ],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "discovery_puzzle",
      "name": "Discovery Puzzle Maker",
      "type": "newtab",
      "url": "https://puzzlemaker.discoveryeducation.com/",
      "tag": "learning",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "natgeo_kids",
      "name": "National Geographic Kids",
      "type": "iframe",
      "url": "https://kids.nationalgeographic.com/games/puzzles/",
      "tag": "learning",
      "seconds": null,
      "steps": ["Explore puzzles and learning games."],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "openguessr",
      "name": "Open Guessr",
      "type": "iframe",
      "url": "https://openguessr.com/",
      "tag": "geography",
      "seconds": null,
      "steps": ["Guess the location."],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "random_quiz",
      "name": "Random Quiz",
      "type": "iframe",
      "url": "https://www.randomtriviagenerator.com/quizzes",
      "tag": "quiz",
      "seconds": null,
      "steps": ["Pick a quiz."],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "edquote",
      "name": "EdQuote",
      "type": "iframe",
      "url": "https://www.hellam.net/edquote.phtml",
      "tag": "teacher",
      "seconds": null,
      "steps": ["Click for a quote. Discuss meaning."],
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
      "steps": ["Deliver the joke confidently."],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "yt_video",
      "name": "YouTube Video",
      "type": "newtab",
      "url": "https://www.youtube.com/",
      "tag": "video",
      "seconds": null,
      "steps": ["Teacher: paste any YouTube link."],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "yt_random_kurzgesagt",
      "name": "Random Kurzgesagt Video",
      "type": "newtab",
      "url": "https://www.youtube.com/@kurzgesagt",
      "tag": "video",
      "seconds": null,
      "steps": ["Watch 2–4 minutes. Share one interesting fact."],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "sequence_guess",
      "name": "Guess the Next Number",
      "type": "sequence",
      "url": "",
      "tag": "math",
      "seconds": null,
      "steps": ["Students guess the next number. Reveal rule."],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "fermi_problem",
      "name": "Fermi Problem",
      "type": "iframe",
      "url": "https://fermi-questions.andrechek.com/",
      "tag": "thinking",
      "seconds": null,
      "steps": ["Make an educated estimate."],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "photo_guess",
      "name": "Photo Guess",
      "type": "newtab",
      "url": "https://www.braingle.com/trivia/photo.php",
      "tag": "visual",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "random_question",
      "name": "Random Question",
      "type": "iframe",
      "url": "https://faculty.washington.edu/ejslager/random-generator/index.html",
      "tag": "discussion",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "random_fact",
      "name": "Random Fact",
      "type": "iframe",
      "url": "https://random-fact-generator-jade.vercel.app/",
      "tag": "learning",
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
      "tag": "word",
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
      "tag": "thinking",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    },

    {
      "id": "rps",
      "name": "Rock • Paper • Scissors",
      "type": "rps",
      "url": "",
      "tag": "game",
      "seconds": null,
      "steps": [],
      "autoOpen": false,
      "enabled": true
    },

    /* ================= HARDCODED TIMED ACTIVITIES ================= */

    { "id":"power_pose","name":"30s Power Pose","type":"timed","url":"","tag":"calm","seconds":30,"steps":["Stand up.","Power pose.","Big breath in and out."],"autoOpen":false,"enabled":true },

    { "id":"silent_statue","name":"Silent Statue Challenge","type":"timed","url":"","tag":"fun","seconds":45,"steps":["Freeze.","No moving.","Teacher tries to make you laugh."],"autoOpen":false,"enabled":true },

    { "id":"speed_stretch","name":"60s Speed Stretch","type":"timed","url":"","tag":"movement","seconds":60,"steps":["Touch toes.","Reach up.","Roll shoulders.","Shake out."],"autoOpen":false,"enabled":true },

    { "id":"desk_workout","name":"Desk Workout","type":"timed","url":"","tag":"movement","seconds":60,"steps":["10 jumping jacks.","10 squats.","10 high knees."],"autoOpen":false,"enabled":true },

    { "id":"dance_party","name":"90s Dance Party","type":"timed","url":"","tag":"energy","seconds":90,"steps":["Stand up.","Dance freely."],"autoOpen":false,"enabled":true },

    { "id":"walk_talk","name":"2-Min Walk & Talk","type":"timed","url":"","tag":"social","seconds":120,"steps":["Walk around.","Share a win.","Switch partner halfway."],"autoOpen":false,"enabled":true },

    { "id":"category_blitz","name":"60s Category Blitz","type":"timed","url":"","tag":"thinking","seconds":60,"steps":["Teacher picks category.","List as many as possible."],"autoOpen":false,"enabled":true },

    { "id":"alphabet_race","name":"Alphabet Race","type":"timed","url":"","tag":"thinking","seconds":90,"steps":["Pick a theme.","Go A–Z."],"autoOpen":false,"enabled":true },

    { "id":"gratitude","name":"2-Min Gratitude","type":"timed","url":"","tag":"calm","seconds":120,"steps":["Write 3 things you’re grateful for."],"autoOpen":false,"enabled":true },

    { "id":"box_breathing","name":"Box Breathing","type":"timed","url":"","tag":"calm","seconds":60,"steps":["Inhale 4.","Hold 4.","Exhale 4.","Hold 4."],"autoOpen":false,"enabled":true },

    { "id":"deep_focus","name":"90s Deep Focus","type":"timed","url":"","tag":"focus","seconds":90,"steps":["Sit still.","Close eyes.","Focus on breathing."],"autoOpen":false,"enabled":true },

    { "id":"drawing_challenge","name":"60s Drawing Challenge","type":"timed","url":"","tag":"creative","seconds":60,"steps":["Draw without lifting pen."],"autoOpen":false,"enabled":true },

    { "id":"memory_recall","name":"Memory Recall","type":"timed","url":"","tag":"revision","seconds":60,"steps":["Write 5 things from last lesson."],"autoOpen":false,"enabled":true },

    { "id":"count_backwards","name":"Count Backwards by 7s","type":"timed","url":"","tag":"math","seconds":45,"steps":["Start at 100.","Count down by 7."],"autoOpen":false,"enabled":true }

  ]
};
