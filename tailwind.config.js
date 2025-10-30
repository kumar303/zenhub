/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "olympic-blue": "#0081C8",
        "olympic-yellow": "#FCB131",
        "olympic-green": "#00A651",
        "olympic-red": "#EE334E",
        "olympic-purple": "#A020F0",
      },
    },
  },
  plugins: [],
};
