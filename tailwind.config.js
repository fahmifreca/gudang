/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html","./src/**/*.{js,ts,jsx,tsx,html}","./public/**/*.js"],
  theme: { extend: {} },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/aspect-ratio"),
    require("@tailwindcss/line-clamp"),
  ],
  safelist: [
    "hidden","active",
    { pattern: /(bg|text|border|ring)-(slate|indigo|red|green|blue|yellow|purple|cyan|sky|teal)-(50|100|200|300|400|500|600|700|800|900)/,
      variants: ["hover","focus","active","sm","md","lg"] }
  ]
};
