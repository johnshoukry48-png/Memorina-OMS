/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        cairo: ["Cairo", "sans-serif"],
      },
      colors: {
        // Sampled from the Memorina logo (teal background, coral/pink accent).
        memorina: {
          teal: "#3F7868",      // deeper teal — primary buttons, active nav, links
          "teal-light": "#589B8A", // logo's exact background teal — soft fills, hovers
          coral: "#F0A490",     // logo's accent pink — highlights, badges
        },
      },
    },
  },
  plugins: [],
};
