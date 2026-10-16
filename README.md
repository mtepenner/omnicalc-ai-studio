# OmniCalc AI Studio 🧮✨

**OmniCalc AI Studio** is a full-stack scientific calculator and interactive math workspace powered by **React**, **Tailwind CSS**, **Firebase Firestore**, and the **Google Gemini API**. It combines a precision scientific calculation engine with multimodal AI capabilities—allowing you to evaluate complex expressions, parse natural language queries, extract math problems from images, and sync custom reusable formulas to the cloud.

---

## 🚀 Key Features

### 1. Standard & Scientific Calculator Engine
- **Dual Modes:** Seamlessly toggle between **Standard** and **Scientific** layouts.
- **Advanced Functions:** Full support for trigonometric (`sin`, `cos`, `tan`, `asin`, `acos`, `atan`), logarithmic (`ln`, `log₁₀`), exponential (`x²`, `xʸ`, `√x`, `∛x`), and factorial (`n!`) operations.
- **State Controls:** Switch between `DEG` and `RAD` angle units and manage running values with memory keys (`MC`, `MR`, `M+`, `M-`).
- **Live Preview & Keyboard Support:** Real-time expression evaluation preview and full physical keyboard bindings for rapid input.

### 2. Gemini AI Math Assistant
- **Natural Language Smart Bar:** Type plain-English prompts (e.g., *"Calculate the escape velocity of Earth"* or *"Compound interest on $5,000 at 6% for 10 years"*) directly above the keypad to convert words into runnable expressions with step-by-step breakdowns.
- **One-Click AI Explain:** Click **AI Explain** on the calculator display to generate a structured, step-by-step mathematical walkthrough of the active expression.
- **Multimodal Vision & Problem Threads:** Create persistent AI chat threads, upload photos or screenshots of handwritten or printed equations, and load extracted expressions directly into the calculator or graphing view with one click.

### 3. Cloud Persistence & Custom Formula Studio
- **Real-Time Sync:** Automatically backs up calculation history, saved custom formulas, and multi-turn AI problem-solving threads using **Firebase Authentication** and **Cloud Firestore**.
- **Interactive Formula Runner:** Define reusable formulas with custom variables, input test values via an interactive form, and compute results instantly.

---

## 🛠️ Tech Stack

- **Frontend:** React 18+, Tailwind CSS, Lucide React (Icons)
- **AI Integration:** Google Gemini API (`@google/genai` / REST API with vision & structured JSON outputs)
- **Backend & Persistence:** Firebase Authentication & Cloud Firestore
- **Build Tool:** Vite (recommended)

---

## ⚡ Getting Started

### Prerequisites
- **Node.js** (v18.0.0 or higher)
- A **Google Gemini API Key** ([Get one in Google AI Studio](https://aistudio.google.com/))
- A **Firebase Project** with **Firestore Database** and **Authentication** (Anonymous sign-in enabled)

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/omnicalc-ai-studio.git](https://github.com/your-username/omnicalc-ai-studio.git)
   cd omnicalc-ai-studio
   ```

2. **Install dependencies:**
   ```bash
   npm install
   npm install lucide-react firebase
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory and add your Firebase and Gemini credentials:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VITE_FIREBASE_CONFIG={"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `0-9`, `.` | Number and decimal input |
| `+`, `-`, `*`, `/` | Basic arithmetic operators |
| `(` , `)` , `^` | Parentheses and exponentiation |
| `Enter` or `=` | Evaluate active expression |
| `Backspace` | Delete last character |
| `Escape` | Clear all (`AC`) |

---

## 📂 Project Structure

```text
├── src/
│   ├── calculator_app.jsx   # Main full-stack application component
│   ├── main.jsx             # React DOM entry point
│   └── index.css            # Tailwind CSS imports & custom scrollbars
├── .env.example             # Environment variable template
├── package.json             # Dependencies and scripts
└── README.md                # Project documentation
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
