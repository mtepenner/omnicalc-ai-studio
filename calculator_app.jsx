
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Calculator,
  Sparkles,
  History,
  Bookmark,
  MessageSquare,
  Trash2,
  Plus,
  Send,
  Copy,
  Check,
  ArrowRight,
  CornerDownLeft,
  BookOpen,
  Cpu,
  Cloud,
  CloudOff,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Star,
  HelpCircle,
  Zap,
  Sliders,
  Play,
  X,
  Edit3,
  Layers,
  Wand2,
  Sigma,
  FunctionSquare,
  AlertCircle,
  Sun,
  Moon,
  Upload,
  Eye
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';

// ==========================================
// FIREBASE INITIALIZATION
// ==========================================
const appId = typeof __app_id !== 'undefined' ? __app_id : 'omnicalc-ai-studio';
const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config
  ? JSON.parse(__firebase_config)
  : null;

let app = null;
let auth = null;
let db = null;

if (firebaseConfig && Object.keys(firebaseConfig).length > 0) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error('Firebase initialization error:', e);
  }
}

// ==========================================
// GEMINI API HELPER WITH EXPONENTIAL BACKOFF
// ==========================================
const GEMINI_MODEL = 'gemini-3-flash-preview';

async function callGeminiAPI({ prompt, systemInstruction, responseSchema = null, inlineImage = null }) {
  const apiKey = '';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const parts = [{ text: prompt }];
  if (inlineImage && inlineImage.data) {
    parts.push({
      inlineData: {
        mimeType: inlineImage.mimeType || 'image/png',
        data: inlineImage.data
      }
    });
  }

  const payload = {
    contents: [{ role: 'user', parts }],
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    }
  };

  if (responseSchema) {
    payload.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema
    };
  }

  const delays = [1000, 2000, 4000, 8000];
  let lastError = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API status ${response.status}`);
      }

      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      return responseSchema ? JSON.parse(text) : text;
    } catch (err) {
      lastError = err;
      if (attempt < delays.length) {
        await new Promise((res) => setTimeout(res, delays[attempt]));
      }
    }
  }

  throw lastError || new Error('Failed to reach Gemini AI service.');
}

// ==========================================
// MATHEMATICAL ENGINE & SAFE PARSER
// ==========================================
function factorial(n) {
  if (n < 0) return NaN;
  if (n === 0 || n === 1) return 1;
  if (n > 170) return Infinity;
  if (!Number.isInteger(n)) {
    // Gamma approximation for non-integers
    return Math.sqrt(2 * Math.PI * n) * Math.pow(n / Math.E, n);
  }
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function evaluateMathExpression(rawExpr, isDegree = true, ansValue = 0) {
  if (!rawExpr || !rawExpr.trim()) return { value: '', error: null };

  try {
    let expr = rawExpr
      .trim()
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/Ans/gi, `(${Number(ansValue) || 0})`)
      .replace(/π|pi/gi, '(Math.PI)')
      .replace(/\be\b/g, '(Math.E)');

    // Handle factorials e.g., 5! or (3+2)!
    while (/(\d+|\([^()]+\))!/.test(expr)) {
      expr = expr.replace(/(\d+|\([^()]+\))!/g, '__fact($1)');
    }

    // Handle percentage e.g., 50% -> (50/100)
    expr = expr.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

    // Implicit multiplication: 2(3), (2)(3), 2sin(30), )2
    expr = expr
      .replace(/(\d)(\()/g, '$1*$2')
      .replace(/(\))(\d)/g, '$1*$2')
      .replace(/(\))(\()/g, '$1*$2')
      .replace(/(\d)(sin|cos|tan|asin|acos|atan|sqrt|cbrt|log|ln|abs|Math)/g, '$1*$2');

    // Replace scientific functions with internal helpers
    expr = expr
      .replace(/\basin\(/g, '__asin(')
      .replace(/\bacos\(/g, '__acos(')
      .replace(/\batan\(/g, '__atan(')
      .replace(/\bsin\(/g, '__sin(')
      .replace(/\bcos\(/g, '__cos(')
      .replace(/\btan\(/g, '__tan(')
      .replace(/\bln\(/g, '__ln(')
      .replace(/\blog\(/g, '__log10(')
      .replace(/\bsqrt\(/g, 'Math.sqrt(')
      .replace(/\bcbrt\(/g, 'Math.cbrt(')
      .replace(/\babs\(/g, 'Math.abs(')
      .replace(/√\(/g, 'Math.sqrt(')
      .replace(/√(\d+(?:\.\d+)?)/g, 'Math.sqrt($1)')
      .replace(/\^/g, '**');

    // Auto-close unclosed parentheses for live evaluation
    const openParens = (expr.match(/\(/g) || []).length;
    const closeParens = (expr.match(/\)/g) || []).length;
    if (openParens > closeParens) {
      expr += ')'.repeat(openParens - closeParens);
    }

    const toRad = (val) => (isDegree ? (val * Math.PI) / 180 : val);
    const fromRad = (val) => (isDegree ? (val * 180) / Math.PI : val);

    const context = {
      __sin: (x) => {
        const rad = toRad(x);
        // Clean floating point near zero for sin(180), sin(360)
        const v = Math.sin(rad);
        return Math.abs(v) < 1e-15 ? 0 : v;
      },
      __cos: (x) => {
        const rad = toRad(x);
        const v = Math.cos(rad);
        return Math.abs(v) < 1e-15 ? 0 : v;
      },
      __tan: (x) => {
        if (isDegree && Math.abs(x % 180) === 90) return NaN;
        const rad = toRad(x);
        const v = Math.tan(rad);
        return Math.abs(v) < 1e-15 ? 0 : v;
      },
      __asin: (x) => fromRad(Math.asin(x)),
      __acos: (x) => fromRad(Math.acos(x)),
      __atan: (x) => fromRad(Math.atan(x)),
      __ln: (x) => Math.log(x),
      __log10: (x) => Math.log10(x),
      __fact: (x) => factorial(x)
    };

    const fn = new Function(
      ...Object.keys(context),
      `"use strict"; return (${expr});`
    );

    const rawResult = fn(...Object.values(context));

    if (typeof rawResult !== 'number' || Number.isNaN(rawResult)) {
      return { value: '', error: 'Math Domain Error' };
    }
    if (!Number.isFinite(rawResult)) {
      return { value: 'Infinity', error: 'Division by zero or overflow' };
    }

    // Format precision cleanly to avoid 0.1 + 0.2 = 0.30000000000000004
    const formatted =
      Math.abs(rawResult) > 1e12 || (Math.abs(rawResult) > 0 && Math.abs(rawResult) < 1e-7)
        ? rawResult.toExponential(6).replace(/\.?0+e/, 'e')
        : Number(Math.round(Number(rawResult + 'e12')) + 'e-12').toString();

    return { value: formatted, error: null };
  } catch (err) {
    return { value: '', error: 'Syntax Error' };
  }
}

// ==========================================
// STARTER FAVORITE FORMULAS
// ==========================================
const DEFAULT_FORMULAS = [
  {
    id: 'preset-compound-interest',
    name: 'Compound Interest',
    category: 'Finance',
    description: 'Calculates total accumulated value P(1 + r/n)^(nt)',
    formulaTemplate: 'P * (1 + (r/100)/n)^(n*t)',
    variables: [
      { symbol: 'P', label: 'Principal ($)', defaultVal: '5000' },
      { symbol: 'r', label: 'Annual Rate (%)', defaultVal: '6.5' },
      { symbol: 'n', label: 'Compounds/Yr', defaultVal: '12' },
      { symbol: 't', label: 'Years', defaultVal: '10' }
    ],
    isPreset: true
  },
  {
    id: 'preset-quadratic-pos',
    name: 'Quadratic Root (+)',
    category: 'Algebra',
    description: 'Positive root of ax² + bx + c = 0',
    formulaTemplate: '(-b + sqrt(b^2 - 4*a*c)) / (2*a)',
    variables: [
      { symbol: 'a', label: 'Coeff a', defaultVal: '1' },
      { symbol: 'b', label: 'Coeff b', defaultVal: '-5' },
      { symbol: 'c', label: 'Coeff c', defaultVal: '6' }
    ],
    isPreset: true
  },
  {
    id: 'preset-projectile-range',
    name: 'Projectile Range',
    category: 'Physics',
    description: 'Horizontal distance R = (v² * sin(2θ)) / g',
    formulaTemplate: '(v^2 * sin(2 * theta)) / g',
    variables: [
      { symbol: 'v', label: 'Velocity (m/s)', defaultVal: '25' },
      { symbol: 'theta', label: 'Launch Angle (°)', defaultVal: '45' },
      { symbol: 'g', label: 'Gravity (m/s²)', defaultVal: '9.81' }
    ],
    isPreset: true
  },
  {
    id: 'preset-kinetic-energy',
    name: 'Kinetic Energy',
    category: 'Physics',
    description: 'Energy of a moving object KE = 0.5 * m * v²',
    formulaTemplate: '0.5 * m * v^2',
    variables: [
      { symbol: 'm', label: 'Mass (kg)', defaultVal: '12' },
      { symbol: 'v', label: 'Velocity (m/s)', defaultVal: '15' }
    ],
    isPreset: true
  }
];

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function OmniCalcApp() {
  // Theme state
  const [darkMode, setDarkMode] = useState(true);

  // Firebase User & Sync States
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('connecting'); // 'connecting' | 'synced' | 'offline'

  // Calculator Core State
  const [expression, setExpression] = useState('');
  const [displayResult, setDisplayResult] = useState('0');
  const [lastAns, setLastAns] = useState('0');
  const [calcMode, setCalcMode] = useState('scientific'); // 'standard' | 'scientific'
  const [isDegree, setIsDegree] = useState(true);
  const [memoryValue, setMemoryValue] = useState(0);
  const [calcError, setCalcError] = useState(null);

  // Quick Natural Language Bar inside Calculator
  const [nlQuery, setNlQuery] = useState('');
  const [nlLoading, setNlLoading] = useState(false);
  const [quickExplanation, setQuickExplanation] = useState(null);
  const [explainingCurrent, setExplainingCurrent] = useState(false);

  // Right Panel Navigation ('assistant' | 'history' | 'formulas' | 'graph')
  const [activeTab, setActiveTab] = useState('assistant');

  // Persistent Collections State
  const [historyItems, setHistoryItems] = useState([]);
  const [savedFormulas, setSavedFormulas] = useState([]);
  const [aiThreads, setAiThreads] = useState([]);

  // AI Problem-Solving Thread State
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null); // { data, mimeType, previewUrl }

  // Interactive Formula Runner & Custom Formula Modal State
  const [selectedFormula, setSelectedFormula] = useState(null);
  const [formulaVarValues, setFormulaVarValues] = useState({});
  const [showNewFormulaModal, setShowNewFormulaModal] = useState(false);
  const [newFormulaForm, setNewFormulaForm] = useState({
    name: '',
    category: 'Custom',
    description: '',
    formulaTemplate: '',
    variablesRaw: 'x:10, y:5'
  });

  // Function Grapher State
  const [graphFunction, setGraphFunction] = useState('sin(x) * x');
  const [graphDomain, setGraphDomain] = useState({ min: -10, max: 10 });

  // UI Notifications / Toast
  const [toast, setToast] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3200);
  }, []);

  // ==========================================
  // 1. FIREBASE AUTHENTICATION (RULE 3)
  // ==========================================
  useEffect(() => {
    if (!auth) {
      setSyncStatus('offline');
      setAuthReady(true);
      return;
    }

    let isMounted = true;

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error('Authentication error:', err);
        if (isMounted) setSyncStatus('offline');
      }
    };

    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!isMounted) return;
      setUser(currentUser);
      setAuthReady(true);
      setSyncStatus(currentUser ? 'synced' : 'offline');
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // ==========================================
  // 2. FIRESTORE LISTENERS (RULE 1 & RULE 2)
  // ==========================================
  useEffect(() => {
    if (!authReady || !user || !db) return;

    // 1. Calculation History Listener
    const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
    const unsubHistory = onSnapshot(
      historyRef,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sort in JS memory (RULE 2)
        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setHistoryItems(items);
        setSyncStatus('synced');
      },
      (err) => {
        console.error('History snapshot error:', err);
        setSyncStatus('offline');
      }
    );

    // 2. Favorite Formulas Listener
    const formulasRef = collection(db, 'artifacts', appId, 'users', user.uid, 'formulas');
    const unsubFormulas = onSnapshot(
      formulasRef,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setSavedFormulas(items);
      },
      (err) => {
        console.error('Formulas snapshot error:', err);
      }
    );

    // 3. AI Problem-Solving Threads Listener
    const threadsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'ai_threads');
    const unsubThreads = onSnapshot(
      threadsRef,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setAiThreads(items);
        setActiveThreadId((prev) => {
          if (prev && items.some((t) => t.id === prev)) return prev;
          return items.length > 0 ? items[0].id : null;
        });
      },
      (err) => {
        console.error('AI Threads snapshot error:', err);
      }
    );

    return () => {
      unsubHistory();
      unsubFormulas();
      unsubThreads();
    };
  }, [authReady, user]);

  // ==========================================
  // LIVE PREVIEW EVALUATION
  // ==========================================
  const livePreview = useMemo(() => {
    if (!expression.trim()) return { value: '0', error: null };
    return evaluateMathExpression(expression, isDegree, lastAns);
  }, [expression, isDegree, lastAns]);

  // ==========================================
  // PERSISTENCE ACTIONS
  // ==========================================
  const saveHistoryToCloud = useCallback(
    async (expr, result, aiNote = null) => {
      const newEntry = {
        expression: expr,
        result: String(result),
        angleMode: isDegree ? 'DEG' : 'RAD',
        aiExplanation: aiNote,
        timestamp: Date.now()
      };

      if (!user || !db) {
        setHistoryItems((prev) => [{ id: crypto.randomUUID(), ...newEntry }, ...prev]);
        return;
      }

      try {
        const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'history');
        await addDoc(historyRef, newEntry);
      } catch (err) {
        console.error('Failed to save calculation history:', err);
      }
    },
    [user, isDegree]
  );

  const deleteHistoryItem = async (id) => {
    if (!user || !db) {
      setHistoryItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', id));
      showToast('History entry removed');
    } catch (err) {
      console.error('Error deleting history item:', err);
    }
  };

  const clearAllHistory = async () => {
    if (!user || !db) {
      setHistoryItems([]);
      showToast('Calculation history cleared');
      return;
    }
    try {
      await Promise.all(
        historyItems.map((item) =>
          deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', item.id))
        )
      );
      showToast('Cloud calculation history cleared');
    } catch (err) {
      console.error('Error clearing history:', err);
    }
  };

  // ==========================================
  // CALCULATOR BUTTON HANDLERS
  // ==========================================
  const handleTokenInput = useCallback((token) => {
    setCalcError(null);
    setExpression((prev) => prev + token);
  }, []);

  const handleClear = useCallback(() => {
    setExpression('');
    setDisplayResult('0');
    setCalcError(null);
    setQuickExplanation(null);
  }, []);

  const handleBackspace = useCallback(() => {
    setCalcError(null);
    setExpression((prev) => {
      // Remove multi-character tokens cleanly if at the end
      const multiTokens = ['asin(', 'acos(', 'atan(', 'sqrt(', 'cbrt(', 'sin(', 'cos(', 'tan(', 'log(', 'ln(', 'abs(', 'Ans'];
      for (const t of multiTokens) {
        if (prev.endsWith(t)) {
          return prev.slice(0, -t.length);
        }
      }
      return prev.slice(0, -1);
    });
  }, []);

  const handleEquals = useCallback(async () => {
    if (!expression.trim()) return;
    const { value, error } = evaluateMathExpression(expression, isDegree, lastAns);
    if (error || !value) {
      setCalcError(error || 'Invalid Expression');
      return;
    }
    setCalcError(null);
    setDisplayResult(value);
    setLastAns(value);
    await saveHistoryToCloud(expression, value);
    setExpression(value);
  }, [expression, isDegree, lastAns, saveHistoryToCloud]);

  // Memory Operations
  const handleMemory = (op) => {
    const currentVal = Number(livePreview.value || displayResult || 0);
    if (Number.isNaN(currentVal)) return;
    if (op === 'MC') {
      setMemoryValue(0);
      showToast('Memory Cleared');
    } else if (op === 'MR') {
      setExpression((prev) => prev + String(memoryValue));
    } else if (op === 'M+') {
      setMemoryValue((prev) => prev + currentVal);
      showToast(`Added ${currentVal} to Memory`);
    } else if (op === 'M-') {
      setMemoryValue((prev) => prev - currentVal);
      showToast(`Subtracted ${currentVal} from Memory`);
    }
  };

  // Keyboard Support for Calculator
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore keyboard shortcuts if typing in an input or textarea
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        handleTokenInput(e.key);
      } else if (['+', '-', '*', '/', '(', ')', '^', '%', '!'].includes(e.key)) {
        e.preventDefault();
        handleTokenInput(e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTokenInput, handleEquals, handleBackspace, handleClear]);

  // ==========================================
  // GEMINI AI CAPABILITIES
  // ==========================================

  // 1. Natural Language Smart Bar -> Expression + Result + Step-by-Step
  const handleNaturalLanguageSolve = async (e) => {
    if (e) e.preventDefault();
    if (!nlQuery.trim() || nlLoading) return;

    setNlLoading(true);
    setQuickExplanation(null);

    try {
      const schema = {
        type: 'OBJECT',
        properties: {
          parsedExpression: {
            type: 'STRING',
            description:
              'Standard calculator mathematical expression using numbers, +, -, *, /, ^, sqrt(), sin(), cos(), tan(), ln(), log(), pi, e. Must be directly evaluatable.'
          },
          finalAnswer: {
            type: 'STRING',
            description: 'The final numerical or algebraic answer.'
          },
          summaryTitle: {
            type: 'STRING',
            description: 'Concise 3-6 word title of the calculation.'
          },
          steps: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Clear step-by-step breakdown of how the problem is solved.'
          },
          formulaUsed: {
            type: 'STRING',
            description: 'General formula or rule applied (if applicable).'
          }
        },
        propertyOrdering: ['parsedExpression', 'finalAnswer', 'summaryTitle', 'steps', 'formulaUsed']
      };

      const systemInstruction = `You are an expert AI Mathematics Engine integrated into a scientific calculator.
Convert the user's natural language query or word problem into a clean mathematical expression, compute the exact answer, and provide clear step-by-step explanations.
Current Calculator Angle Mode: ${isDegree ? 'DEGREES' : 'RADIANS'}.
Last Calculator Answer (Ans): ${lastAns}.`;

      const response = await callGeminiAPI({
        prompt: nlQuery,
        systemInstruction,
        responseSchema: schema
      });

      if (response.parsedExpression) {
        setExpression(response.parsedExpression);
      }
      if (response.finalAnswer) {
        setDisplayResult(String(response.finalAnswer));
        setLastAns(String(response.finalAnswer));
      }

      setQuickExplanation({
        query: nlQuery,
        ...response
      });

      await saveHistoryToCloud(
        response.parsedExpression || nlQuery,
        response.finalAnswer || '',
        response
      );

      setNlQuery('');
      showToast('AI parsed & solved your query!', 'success');
    } catch (err) {
      console.error('NL Solve error:', err);
      showToast('Could not parse query with AI. Try again.', 'error');
    } finally {
      setNlLoading(false);
    }
  };

  // 2. Explain Current Expression on Calculator Display Step-by-Step
  const handleExplainCurrentCalculation = async () => {
    const targetExpr = expression.trim() || displayResult;
    if (!targetExpr || targetExpr === '0') {
      showToast('Enter a mathematical expression first to explain.');
      return;
    }

    setExplainingCurrent(true);
    try {
      const schema = {
        type: 'OBJECT',
        properties: {
          parsedExpression: { type: 'STRING' },
          finalAnswer: { type: 'STRING' },
          summaryTitle: { type: 'STRING' },
          steps: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          formulaUsed: { type: 'STRING' }
        },
        propertyOrdering: ['parsedExpression', 'finalAnswer', 'summaryTitle', 'steps', 'formulaUsed']
      };

      const systemInstruction = `You are a friendly, rigorous math tutor. Explain how to evaluate the given mathematical expression step-by-step, showing order of operations (PEMDAS/BODMAS), trigonometric identities, or logarithmic properties used. Angle Mode is ${isDegree ? 'DEGREES' : 'RADIANS'}.`;

      const res = await callGeminiAPI({
        prompt: `Explain the evaluation of this mathematical expression step-by-step: ${targetExpr} (Current evaluated value: ${livePreview.value || displayResult})`,
        systemInstruction,
        responseSchema: schema
      });

      setQuickExplanation({
        query: `Explain: ${targetExpr}`,
        ...res
      });
    } catch (err) {
      console.error('Explain error:', err);
      showToast('Failed to generate explanation.', 'error');
    } finally {
      setExplainingCurrent(false);
    }
  };

  // 3. Full Multi-Turn AI Problem-Solving Threads (Persisted in Firestore)
  const activeThread = useMemo(
    () => aiThreads.find((t) => t.id === activeThreadId) || null,
    [aiThreads, activeThreadId]
  );

  const createNewThread = async (initialTitle = 'New Math Session') => {
    const newThreadData = {
      title: initialTitle,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [
        {
          id: 'welcome-msg',
          role: 'assistant',
          content:
            'Hello! I am your **OmniCalc AI Math Assistant**. Ask me word problems, calculus derivatives/integrals, linear algebra questions, or upload an image of a math problem for a complete step-by-step breakdown.',
          steps: [],
          extractedExpression: '',
          finalAnswer: '',
          timestamp: Date.now()
        }
      ]
    };

    if (!user || !db) {
      const localThread = { id: crypto.randomUUID(), ...newThreadData };
      setAiThreads((prev) => [localThread, ...prev]);
      setActiveThreadId(localThread.id);
      return localThread;
    }

    try {
      const threadsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'ai_threads');
      const docRef = await addDoc(threadsRef, newThreadData);
      setActiveThreadId(docRef.id);
      return { id: docRef.id, ...newThreadData };
    } catch (err) {
      console.error('Error creating thread:', err);
      return null;
    }
  };

  const deleteThread = async (threadId, e) => {
    if (e) e.stopPropagation();
    if (!user || !db) {
      setAiThreads((prev) => prev.filter((t) => t.id !== threadId));
      return;
    }
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'ai_threads', threadId));
      showToast('Problem thread deleted');
    } catch (err) {
      console.error('Error deleting thread:', err);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result;
      const base64Data = resultStr.split(',')[1];
      setUploadedImage({
        data: base64Data,
        mimeType: file.type || 'image/png',
        previewUrl: resultStr,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSendThreadMessage = async (e, customPrompt = null) => {
    if (e) e.preventDefault();
    const textToSend = (customPrompt ?? aiInput).trim();
    if ((!textToSend && !uploadedImage) || aiLoading) return;

    setAiLoading(true);
    const currentImg = uploadedImage;
    setAiInput('');
    setUploadedImage(null);

    try {
      let targetThread = activeThread;
      if (!targetThread) {
        targetThread = await createNewThread(
          textToSend ? textToSend.slice(0, 34) : 'Image Math Problem'
        );
      }

      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user',
        content: textToSend || 'Solve the math problem shown in the attached image.',
        hasImage: Boolean(currentImg),
        timestamp: Date.now()
      };

      const updatedMessages = [...(targetThread.messages || []), userMsg];

      // Optimistically update thread if local or cloud
      if (user && db && targetThread.id) {
        const threadDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'ai_threads', targetThread.id);
        await updateDoc(threadDoc, {
          messages: updatedMessages,
          updatedAt: Date.now(),
          title:
            targetThread.title === 'New Math Session' && textToSend
              ? textToSend.slice(0, 36)
              : targetThread.title
        });
      } else {
        setAiThreads((prev) =>
          prev.map((t) =>
            t.id === targetThread.id ? { ...t, messages: updatedMessages, updatedAt: Date.now() } : t
          )
        );
      }

      // Build conversation context for Gemini
      const recentContext = updatedMessages
        .slice(-6)
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

      const responseSchema = {
        type: 'OBJECT',
        properties: {
          explanation: {
            type: 'STRING',
            description: 'Conceptual overview and friendly explanation of the problem.'
          },
          steps: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Ordered step-by-step mathematical derivation and calculation steps.'
          },
          extractedExpression: {
            type: 'STRING',
            description:
              'A calculator-compatible expression (using numbers, +, -, *, /, ^, sqrt(), sin(), cos(), tan(), log(), ln()) that represents the core calculation, if applicable.'
          },
          plotFunctionX: {
            type: 'STRING',
            description:
              'Optional single-variable function of x (e.g., "x^2 - 4*x + 3") if this problem can be visualized on a 2D graph.'
          },
          finalAnswer: {
            type: 'STRING',
            description: 'Concise final answer with units if applicable.'
          }
        },
        propertyOrdering: [
          'explanation',
          'steps',
          'extractedExpression',
          'plotFunctionX',
          'finalAnswer'
        ]
      };

      const systemInstruction = `You are OmniCalc AI, a world-class mathematician, engineer, and educator.
Solve word problems, symbolic math, and numerical problems with extreme accuracy.
Always break down your solution into logical steps, provide a calculator-ready expression if possible, and state the final answer clearly.
Current Calculator State: Expression="${expression}", DisplayResult="${displayResult}", AngleMode="${isDegree ? 'DEG' : 'RAD'}".`;

      const aiRes = await callGeminiAPI({
        prompt: `Conversation History:\n${recentContext}\n\nSolve the latest user request thoroughly.`,
        systemInstruction,
        responseSchema,
        inlineImage: currentImg
      });

      const assistantMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: aiRes.explanation || 'Here is the step-by-step solution:',
        steps: aiRes.steps || [],
        extractedExpression: aiRes.extractedExpression || '',
        plotFunctionX: aiRes.plotFunctionX || '',
        finalAnswer: aiRes.finalAnswer || '',
        timestamp: Date.now()
      };

      const finalMessages = [...updatedMessages, assistantMsg];

      if (user && db && targetThread.id) {
        const threadDoc = doc(db, 'artifacts', appId, 'users', user.uid, 'ai_threads', targetThread.id);
        await updateDoc(threadDoc, {
          messages: finalMessages,
          updatedAt: Date.now()
        });
      } else {
        setAiThreads((prev) =>
          prev.map((t) =>
            t.id === targetThread.id ? { ...t, messages: finalMessages, updatedAt: Date.now() } : t
          )
        );
      }

      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } catch (err) {
      console.error('AI Thread error:', err);
      showToast('AI Assistant encountered an error. Please try again.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  // ==========================================
  // FAVORITE FORMULAS MANAGEMENT
  // ==========================================
  const allFormulas = useMemo(() => {
    return [...savedFormulas, ...DEFAULT_FORMULAS];
  }, [savedFormulas]);

  const openFormulaRunner = (formula) => {
    setSelectedFormula(formula);
    const initialVars = {};
    (formula.variables || []).forEach((v) => {
      initialVars[v.symbol] = v.defaultVal || '1';
    });
    setFormulaVarValues(initialVars);
  };

  const evaluateSelectedFormula = useMemo(() => {
    if (!selectedFormula) return { substituted: '', result: '' };
    let expr = selectedFormula.formulaTemplate;
    const vars = selectedFormula.variables || [];
    // Sort variables by symbol length descending so 'theta' replaces before 't'
    const sortedVars = [...vars].sort((a, b) => b.symbol.length - a.symbol.length);
    for (const v of sortedVars) {
      const val = formulaVarValues[v.symbol] ?? v.defaultVal ?? '0';
      const reg = new RegExp(`\\b${v.symbol}\\b`, 'g');
      expr = expr.replace(reg, `(${val})`);
    }
    const evaluated = evaluateMathExpression(expr, isDegree, lastAns);
    return {
      substituted: expr,
      result: evaluated.error ? 'Invalid inputs' : evaluated.value
    };
  }, [selectedFormula, formulaVarValues, isDegree, lastAns]);

  const handleSaveCustomFormula = async (e) => {
    e.preventDefault();
    if (!newFormulaForm.name.trim() || !newFormulaForm.formulaTemplate.trim()) {
      showToast('Please provide a formula name and template.', 'error');
      return;
    }

    const parsedVars = newFormulaForm.variablesRaw
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [sym, defVal] = pair.split(':').map((s) => s.trim());
        return {
          symbol: sym || 'x',
          label: `Variable ${sym || 'x'}`,
          defaultVal: defVal || '1'
        };
      });

    const formulaDoc = {
      name: newFormulaForm.name.trim(),
      category: newFormulaForm.category.trim() || 'Custom',
      description: newFormulaForm.description.trim() || 'User saved custom formula',
      formulaTemplate: newFormulaForm.formulaTemplate.trim(),
      variables: parsedVars,
      timestamp: Date.now()
    };

    if (!user || !db) {
      setSavedFormulas((prev) => [{ id: crypto.randomUUID(), ...formulaDoc }, ...prev]);
    } else {
      try {
        const ref = collection(db, 'artifacts', appId, 'users', user.uid, 'formulas');
        await addDoc(ref, formulaDoc);
      } catch (err) {
        console.error('Error saving formula:', err);
      }
    }

    setShowNewFormulaModal(false);
    setNewFormulaForm({
      name: '',
      category: 'Custom',
      description: '',
      formulaTemplate: '',
      variablesRaw: 'x:10, y:5'
    });
    showToast('Formula saved to your cloud library!', 'success');
  };

  const deleteSavedFormula = async (id, e) => {
    if (e) e.stopPropagation();
    if (!user || !db) {
      setSavedFormulas((prev) => prev.filter((f) => f.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'formulas', id));
      showToast('Formula deleted');
    } catch (err) {
      console.error('Error deleting formula:', err);
    }
  };

  const saveCurrentExpressionAsFormula = () => {
    if (!expression.trim()) {
      showToast('Type an expression on the calculator first!');
      return;
    }
    setNewFormulaForm({
      name: 'My Calculation Formula',
      category: 'Custom',
      description: `Saved from calculator: ${expression}`,
      formulaTemplate: expression,
      variablesRaw: 'x:1'
    });
    setShowNewFormulaModal(true);
  };

  // ==========================================
  // COPY TO CLIPBOARD HELPER (IFRAME SAFE)
  // ==========================================
  const copyToClipboard = (text, id) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
      showToast('Copied to clipboard');
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  // ==========================================
  // INTERACTIVE SVG FUNCTION GRAPHER
  // ==========================================
  const graphPoints = useMemo(() => {
    if (!graphFunction.trim()) return { path: '', minY: -10, maxY: 10, valid: false };
    const samples = 160;
    const minX = Number(graphDomain.min) || -10;
    const maxX = Number(graphDomain.max) >= minX + 1 ? Number(graphDomain.max) : minX + 10;
    const step = (maxX - minX) / samples;

    const pts = [];
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i <= samples; i++) {
      const xVal = minX + i * step;
      const exprWithX = graphFunction.replace(/\bx\b/g, `(${xVal})`);
      const res = evaluateMathExpression(exprWithX, isDegree, lastAns);
      const yVal = parseFloat(res.value);
      if (!res.error && Number.isFinite(yVal) && Math.abs(yVal) < 1e6) {
        pts.push({ x: xVal, y: yVal });
        if (yVal < minY) minY = yVal;
        if (yVal > maxY) maxY = yVal;
      } else {
        pts.push(null);
      }
    }

    if (minY === Infinity || maxY === -Infinity) {
      return { path: '', minY: -10, maxY: 10, valid: false };
    }
    if (Math.abs(maxY - minY) < 1e-6) {
      minY -= 5;
      maxY += 5;
    }

    const padY = (maxY - minY) * 0.12;
    const lowY = minY - padY;
    const highY = maxY + padY;

    const width = 500;
    const height = 260;

    const toSvgX = (x) => ((x - minX) / (maxX - minX)) * width;
    const toSvgY = (y) => height - ((y - lowY) / (highY - lowY)) * height;

    let pathD = '';
    let penDown = false;
    for (const pt of pts) {
      if (!pt) {
        penDown = false;
        continue;
      }
      const sx = toSvgX(pt.x).toFixed(1);
      const sy = toSvgY(pt.y).toFixed(1);
      if (!penDown) {
        pathD += `M ${sx} ${sy} `;
        penDown = true;
      } else {
        pathD += `L ${sx} ${sy} `;
      }
    }

    const zeroX = minX <= 0 && maxX >= 0 ? toSvgX(0) : null;
    const zeroY = lowY <= 0 && highY >= 0 ? toSvgY(0) : null;

    return {
      path: pathD,
      minX,
      maxX,
      minY: lowY,
      maxY: highY,
      zeroX,
      zeroY,
      valid: Boolean(pathD)
    };
  }, [graphFunction, graphDomain, isDegree, lastAns]);

  // ==========================================
  // RENDER HELPERS
  // ==========================================
  return (
    <div
      className={`min-h-screen w-full transition-colors duration-300 ${
        darkMode
          ? 'bg-slate-950 text-slate-100'
          : 'bg-slate-100 text-slate-900'
      } font-sans flex flex-col`}
    >
      {/* TOP NAVIGATION BAR */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3 ${
          darkMode
            ? 'bg-slate-900/80 border-slate-800'
            : 'bg-white/85 border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-tight">OmniCalc AI Studio</h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                Gemini 3 Flash
              </span>
            </div>
            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Scientific Computation Engine & Cloud AI Problem Solver
            </p>
          </div>
        </div>

        {/* Cloud Status & Mode Switches */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Cloud Sync Badge */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
              syncStatus === 'synced'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
            }`}
            title={user ? `Cloud Sync Active (ID: ${user.uid})` : 'Local Session Mode'}
          >
            {syncStatus === 'synced' ? (
              <>
                <Cloud className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cloud Synced</span>
              </>
            ) : (
              <>
                <CloudOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Session Mode</span>
              </>
            )}
          </div>

          {/* Standard vs Scientific Switch */}
          <div
            className={`flex rounded-xl p-1 border ${
              darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-200/70 border-slate-300'
            }`}
          >
            <button
              onClick={() => setCalcMode('standard')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                calcMode === 'standard'
                  ? 'bg-indigo-600 text-white shadow'
                  : darkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => setCalcMode('scientific')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                calcMode === 'scientific'
                  ? 'bg-indigo-600 text-white shadow'
                  : darkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Scientific
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-xl border transition-colors ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
            title="Toggle Light/Dark Theme"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl border bg-slate-900/95 border-indigo-500/40 text-white text-sm animate-bounce">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* MAIN WORKSPACE GRID */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: STANDARD & SCIENTIFIC CALCULATOR + SMART NL BAR */}
        <section className="lg:col-span-5 xl:col-span-5 flex flex-col gap-4">
          {/* AI Natural Language Math Bar */}
          <div
            className={`rounded-2xl p-3.5 border transition-all ${
              darkMode
                ? 'bg-gradient-to-r from-indigo-950/60 via-slate-900 to-purple-950/50 border-indigo-500/30 shadow-lg shadow-indigo-950/20'
                : 'bg-gradient-to-r from-indigo-50 via-white to-purple-50 border-indigo-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold flex items-center gap-1.5 text-indigo-400">
                <Wand2 className="w-3.5 h-3.5" />
                Natural Language to Math Parser
              </span>
              <span className="text-[11px] opacity-60">Powered by Gemini</span>
            </div>
            <form onSubmit={handleNaturalLanguageSolve} className="flex gap-2">
              <input
                type="text"
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                placeholder="e.g. '18% tip on $84.50' or 'hypotenuse of 9 and 12'"
                className={`flex-1 text-sm rounded-xl px-3.5 py-2.5 border outline-none transition-all ${
                  darkMode
                    ? 'bg-slate-950/90 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                }`}
              />
              <button
                type="submit"
                disabled={nlLoading || !nlQuery.trim()}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all shrink-0"
              >
                {nlLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Solve</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* CALCULATOR DISPLAY & KEYPAD CARD */}
          <div
            className={`rounded-3xl border overflow-hidden flex flex-col shadow-xl ${
              darkMode
                ? 'bg-slate-900 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            {/* Calculator Screen */}
            <div
              className={`p-5 border-b flex flex-col justify-between min-h-[168px] relative ${
                darkMode
                  ? 'bg-slate-950/80 border-slate-800/80'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              {/* Top Status Bar inside Screen */}
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsDegree(!isDegree)}
                    className={`px-2.5 py-1 rounded-lg font-bold tracking-wider transition-colors ${
                      isDegree
                        ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    }`}
                  >
                    {isDegree ? 'DEG' : 'RAD'}
                  </button>
                  {memoryValue !== 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold">
                      M = {memoryValue}
                    </span>
                  )}
                  <span className="opacity-60">Ans = {lastAns}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={saveCurrentExpressionAsFormula}
                    className={`px-2.5 py-1 rounded-lg flex items-center gap-1 text-xs font-medium border transition-colors ${
                      darkMode
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:border-indigo-500/50'
                        : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-500'
                    }`}
                    title="Save current expression as reusable formula"
                  >
                    <Bookmark className="w-3 h-3 text-indigo-400" />
                    <span>Save Formula</span>
                  </button>
                  <button
                    onClick={handleExplainCurrentCalculation}
                    disabled={explainingCurrent}
                    className="px-2.5 py-1 rounded-lg flex items-center gap-1 text-xs font-medium bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 border border-indigo-500/30 transition-colors"
                    title="Ask Gemini AI to explain this step-by-step"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{explainingCurrent ? 'Thinking...' : 'AI Explain'}</span>
                  </button>
                </div>
              </div>

              {/* Expression Input Line */}
              <div className="mt-4">
                <input
                  type="text"
                  value={expression}
                  onChange={(e) => {
                    setCalcError(null);
                    setExpression(e.target.value);
                  }}
                  placeholder="0"
                  className={`w-full text-right font-mono text-xl sm:text-2xl bg-transparent outline-none tracking-wide ${
                    darkMode ? 'text-slate-300 placeholder-slate-700' : 'text-slate-700 placeholder-slate-300'
                  }`}
                />
              </div>

              {/* Result & Live Preview Line */}
              <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-slate-800/40">
                <span className="text-xs font-mono opacity-50">
                  {calcError ? (
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {calcError}
                    </span>
                  ) : expression && livePreview.value && !livePreview.error ? (
                    `≈ ${livePreview.value}`
                  ) : (
                    'Ready'
                  )}
                </span>
                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-indigo-400">
                    {expression && !livePreview.error && livePreview.value
                      ? livePreview.value
                      : displayResult}
                  </span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        expression && !livePreview.error && livePreview.value
                          ? livePreview.value
                          : displayResult,
                        'calc-screen'
                      )
                    }
                    className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
                    title="Copy Result"
                  >
                    {copiedId === 'calc-screen' ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick AI Step-by-Step Popover inside Calculator if triggered */}
            {quickExplanation && (
              <div
                className={`p-4 border-b text-xs space-y-2 ${
                  darkMode
                    ? 'bg-indigo-950/30 border-indigo-500/30 text-slate-200'
                    : 'bg-indigo-50/80 border-indigo-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-400 flex items-center gap-1.5 text-sm">
                    <Sparkles className="w-4 h-4" />
                    {quickExplanation.summaryTitle || 'Step-by-Step AI Breakdown'}
                  </span>
                  <button
                    onClick={() => setQuickExplanation(null)}
                    className="p-1 rounded-lg hover:bg-slate-800/40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {quickExplanation.formulaUsed && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 font-mono text-[11px]">
                    Formula: {quickExplanation.formulaUsed}
                  </div>
                )}
                <ol className="list-decimal list-inside space-y-1.5 pl-1">
                  {(quickExplanation.steps || []).map((step, i) => (
                    <li key={i} className="leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Memory Bar */}
            <div
              className={`grid grid-cols-5 gap-1.5 px-4 pt-3 pb-1 text-xs font-semibold ${
                darkMode ? 'bg-slate-900' : 'bg-white'
              }`}
            >
              {['MC', 'MR', 'M+', 'M-'].map((mBtn) => (
                <button
                  key={mBtn}
                  onClick={() => handleMemory(mBtn)}
                  className={`py-1.5 rounded-lg border transition-colors ${
                    darkMode
                      ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {mBtn}
                </button>
              ))}
              <button
                onClick={() => handleTokenInput('Ans')}
                className={`py-1.5 rounded-lg border transition-colors ${
                  darkMode
                    ? 'bg-slate-950/60 border-slate-800 text-indigo-400 hover:bg-slate-800'
                    : 'bg-slate-100 border-slate-200 text-indigo-600 hover:bg-slate-200'
                }`}
              >
                Ans
              </button>
            </div>

            {/* SCIENTIFIC EXTENSION KEYS */}
            {calcMode === 'scientific' && (
              <div className="grid grid-cols-5 gap-2 px-4 pt-2 pb-1">
                {[
                  { label: 'sin', token: 'sin(' },
                  { label: 'cos', token: 'cos(' },
                  { label: 'tan', token: 'tan(' },
                  { label: 'π', token: 'π' },
                  { label: 'e', token: 'e' },
                  { label: 'sin⁻¹', token: 'asin(' },
                  { label: 'cos⁻¹', token: 'acos(' },
                  { label: 'tan⁻¹', token: 'atan(' },
                  { label: 'x²', token: '^2' },
                  { label: 'xʸ', token: '^' },
                  { label: 'ln', token: 'ln(' },
                  { label: 'log₁₀', token: 'log(' },
                  { label: '√x', token: 'sqrt(' },
                  { label: '∛x', token: 'cbrt(' },
                  { label: 'n!', token: '!' },
                  { label: '(', token: '(' },
                  { label: ')', token: ')' },
                  { label: '|x|', token: 'abs(' },
                  { label: '1/x', token: '^(-1)' },
                  { label: '%', token: '%' }
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={() => handleTokenInput(btn.token)}
                    className={`py-2.5 rounded-xl font-medium text-xs sm:text-sm border transition-all active:scale-95 ${
                      darkMode
                        ? 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-indigo-300'
                        : 'bg-indigo-50/60 hover:bg-indigo-100 border-indigo-100 text-indigo-900'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}

            {/* STANDARD CORE KEYPAD */}
            <div className="grid grid-cols-4 gap-2.5 p-4">
              <button
                onClick={handleClear}
                className="py-3.5 rounded-2xl font-bold text-sm bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition-all active:scale-95"
              >
                AC
              </button>
              <button
                onClick={handleBackspace}
                className={`py-3.5 rounded-2xl font-semibold text-sm border transition-all active:scale-95 ${
                  darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-700'
                }`}
              >
                DEL
              </button>
              <button
                onClick={() => handleTokenInput(calcMode === 'standard' ? '%' : '(')}
                className={`py-3.5 rounded-2xl font-semibold text-sm border transition-all active:scale-95 ${
                  darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    : 'bg-slate-200 hover:bg-slate-300 border-slate-300 text-slate-700'
                }`}
              >
                {calcMode === 'standard' ? '%' : '('}
              </button>
              <button
                onClick={() => handleTokenInput('÷')}
                className="py-3.5 rounded-2xl font-bold text-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30 transition-all active:scale-95"
              >
                ÷
              </button>

              {['7', '8', '9'].map((n) => (
                <button
                  key={n}
                  onClick={() => handleTokenInput(n)}
                  className={`py-4 rounded-2xl font-bold text-lg border transition-all active:scale-95 ${
                    darkMode
                      ? 'bg-slate-950/90 hover:bg-slate-800 border-slate-800 text-white'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900 shadow-sm'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => handleTokenInput('×')}
                className="py-4 rounded-2xl font-bold text-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30 transition-all active:scale-95"
              >
                ×
              </button>

              {['4', '5', '6'].map((n) => (
                <button
                  key={n}
                  onClick={() => handleTokenInput(n)}
                  className={`py-4 rounded-2xl font-bold text-lg border transition-all active:scale-95 ${
                    darkMode
                      ? 'bg-slate-950/90 hover:bg-slate-800 border-slate-800 text-white'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900 shadow-sm'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => handleTokenInput('-')}
                className="py-4 rounded-2xl font-bold text-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30 transition-all active:scale-95"
              >
                −
              </button>

              {['1', '2', '3'].map((n) => (
                <button
                  key={n}
                  onClick={() => handleTokenInput(n)}
                  className={`py-4 rounded-2xl font-bold text-lg border transition-all active:scale-95 ${
                    darkMode
                      ? 'bg-slate-950/90 hover:bg-slate-800 border-slate-800 text-white'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900 shadow-sm'
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => handleTokenInput('+')}
                className="py-4 rounded-2xl font-bold text-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30 transition-all active:scale-95"
              >
                +
              </button>

              <button
                onClick={() =>
                  setExpression((prev) =>
                    prev.startsWith('-') ? prev.slice(1) : `-${prev}`
                  )
                }
                className={`py-4 rounded-2xl font-semibold text-base border transition-all active:scale-95 ${
                  darkMode
                    ? 'bg-slate-950/90 hover:bg-slate-800 border-slate-800 text-slate-300'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                ±
              </button>
              <button
                onClick={() => handleTokenInput('0')}
                className={`py-4 rounded-2xl font-bold text-lg border transition-all active:scale-95 ${
                  darkMode
                    ? 'bg-slate-950/90 hover:bg-slate-800 border-slate-800 text-white'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900 shadow-sm'
                }`}
              >
                0
              </button>
              <button
                onClick={() => handleTokenInput('.')}
                className={`py-4 rounded-2xl font-bold text-lg border transition-all active:scale-95 ${
                  darkMode
                    ? 'bg-slate-950/90 hover:bg-slate-800 border-slate-800 text-white'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900 shadow-sm'
                }`}
              >
                .
              </button>
              <button
                onClick={handleEquals}
                className="py-4 rounded-2xl font-bold text-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
              >
                =
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: AI MATH ASSISTANT, CLOUD HISTORY, FAVORITE FORMULAS & GRAPHER */}
        <section className="lg:col-span-7 xl:col-span-7 flex flex-col">
          <div
            className={`flex-1 rounded-3xl border overflow-hidden flex flex-col shadow-xl min-h-[640px] ${
              darkMode
                ? 'bg-slate-900 border-slate-800'
                : 'bg-white border-slate-200'
            }`}
          >
            {/* Right Panel Tab Navigation */}
            <div
              className={`flex items-center justify-between px-4 pt-3 border-b overflow-x-auto ${
                darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-1">
                {[
                  {
                    id: 'assistant',
                    label: 'AI Math Tutor',
                    icon: Sparkles,
                    badge: aiThreads.length
                  },
                  {
                    id: 'formulas',
                    label: 'Formulas Library',
                    icon: Bookmark,
                    badge: allFormulas.length
                  },
                  {
                    id: 'history',
                    label: 'Cloud History',
                    icon: History,
                    badge: historyItems.length
                  },
                  {
                    id: 'graph',
                    label: 'Function Graph',
                    icon: FunctionSquare,
                    badge: null
                  }
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                        active
                          ? 'border-indigo-500 text-indigo-400'
                          : 'border-transparent opacity-65 hover:opacity-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {tab.badge !== null && tab.badge > 0 && (
                        <span
                          className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                            active
                              ? 'bg-indigo-500/20 text-indigo-300'
                              : 'bg-slate-500/20 text-slate-400'
                          }`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ==========================================
                TAB 1: AI MATH ASSISTANT & THREADS
            ========================================== */}
            {activeTab === 'assistant' && (
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Thread Sidebar */}
                <div
                  className={`w-full md:w-60 border-b md:border-b-0 md:border-r flex flex-col shrink-0 ${
                    darkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50/70 border-slate-200'
                  }`}
                >
                  <div className="p-3 border-b border-slate-800/40 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                      Problem Threads
                    </span>
                    <button
                      onClick={() => createNewThread('New Math Session')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New</span>
                    </button>
                  </div>

                  {/* Thread List */}
                  <div className="flex md:flex-col overflow-x-auto md:overflow-y-auto p-2 gap-1.5 max-h-32 md:max-h-none flex-1">
                    {aiThreads.length === 0 ? (
                      <div className="p-4 text-center text-xs opacity-50">
                        No threads yet. Ask a math question to start!
                      </div>
                    ) : (
                      aiThreads.map((thread) => (
                        <div
                          key={thread.id}
                          onClick={() => setActiveThreadId(thread.id)}
                          className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl cursor-pointer text-xs font-medium transition-all shrink-0 md:shrink ${
                            activeThreadId === thread.id
                              ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                              : darkMode
                              ? 'hover:bg-slate-800/60 text-slate-300'
                              : 'hover:bg-slate-200/70 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            <span className="truncate max-w-[130px]">{thread.title}</span>
                          </div>
                          <button
                            onClick={(e) => deleteThread(thread.id, e)}
                            className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-1 transition-opacity"
                            title="Delete Thread"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Quick Prompt Suggestions */}
                  <div className="hidden md:block p-3 border-t border-slate-800/40 space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider opacity-50">
                      Try Word Problems
                    </span>
                    {[
                      'A train leaves at 65 mph and another at 80 mph 30 mins later. When do they meet?',
                      'Find the maximum area of a rectangle with perimeter 100m',
                      'Monthly payment on a $320,000 mortgage at 6.2% for 30 years'
                    ].map((sample, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendThreadMessage(null, sample)}
                        className={`w-full text-left text-[11px] p-2 rounded-lg border transition-colors line-clamp-2 ${
                          darkMode
                            ? 'bg-slate-900/80 border-slate-800 hover:border-indigo-500/40 text-slate-300'
                            : 'bg-white border-slate-200 hover:border-indigo-400 text-slate-700'
                        }`}
                      >
                        "{sample}"
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Thread Conversation Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[460px] lg:max-h-[520px]">
                    {!activeThread ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                          <Sparkles className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-base">AI Problem-Solving Workspace</h3>
                        <p className="text-xs opacity-65 max-w-md leading-relaxed">
                          Ask any word problem, algebra system, calculus integral, physics scenario, or upload a photo of a handwritten equation. Every thread is saved to your cloud account.
                        </p>
                      </div>
                    ) : (
                      (activeThread.messages || []).map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            msg.role === 'user' ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div
                            className={`max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 space-y-3 ${
                              msg.role === 'user'
                                ? 'bg-indigo-600 text-white'
                                : darkMode
                                ? 'bg-slate-950/90 border border-slate-800 text-slate-200'
                                : 'bg-slate-100 border border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="text-sm leading-relaxed whitespace-pre-wrap">
                              {msg.content}
                            </div>

                            {/* Step-by-Step Breakdown Cards */}
                            {msg.steps && msg.steps.length > 0 && (
                              <div
                                className={`rounded-xl p-3 space-y-2 border ${
                                  darkMode
                                    ? 'bg-slate-900/90 border-slate-800'
                                    : 'bg-white border-slate-200'
                                }`}
                              >
                                <div className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5" />
                                  Step-by-Step Solution
                                </div>
                                <ol className="space-y-2 text-xs">
                                  {msg.steps.map((stepText, idx) => (
                                    <li key={idx} className="flex gap-2.5 leading-relaxed">
                                      <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center shrink-0 text-[11px]">
                                        {idx + 1}
                                      </span>
                                      <span className="pt-0.5">{stepText}</span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}

                            {/* Extracted Expression & Final Answer Action Bar */}
                            {(msg.extractedExpression || msg.finalAnswer) && (
                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-700/40">
                                {msg.finalAnswer && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs opacity-60">Answer:</span>
                                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono font-bold text-xs">
                                      {msg.finalAnswer}
                                    </span>
                                  </div>
                                )}

                                <div className="flex items-center gap-2">
                                  {msg.extractedExpression && (
                                    <button
                                      onClick={() => {
                                        setExpression(msg.extractedExpression);
                                        showToast('Loaded expression into calculator!');
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                                    >
                                      <CornerDownLeft className="w-3 h-3" />
                                      <span>Load to Calc</span>
                                    </button>
                                  )}
                                  {msg.plotFunctionX && (
                                    <button
                                      onClick={() => {
                                        setGraphFunction(msg.plotFunctionX);
                                        setActiveTab('graph');
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                                    >
                                      <FunctionSquare className="w-3 h-3" />
                                      <span>Plot Graph</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {aiLoading && (
                      <div className="flex items-center gap-3 p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 w-fit">
                        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        <span>Gemini is deriving the step-by-step mathematical solution...</span>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Image Upload Preview */}
                  {uploadedImage && (
                    <div className="px-4 py-2 border-t border-slate-800 flex items-center justify-between bg-indigo-950/30">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={uploadedImage.previewUrl}
                          alt="Math upload"
                          className="w-10 h-10 object-cover rounded-lg border border-indigo-500/40"
                        />
                        <div className="text-xs">
                          <p className="font-semibold text-indigo-300">Image attached for AI Vision</p>
                          <p className="opacity-60 truncate max-w-[180px]">{uploadedImage.name}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setUploadedImage(null)}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Chat Input Footer */}
                  <form
                    onSubmit={handleSendThreadMessage}
                    className={`p-3 border-t flex items-center gap-2 ${
                      darkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-2.5 rounded-xl border transition-colors ${
                        darkMode
                          ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-indigo-400'
                          : 'bg-white border-slate-300 text-slate-600 hover:text-indigo-600'
                      }`}
                      title="Upload image of a math problem"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    <input
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="Ask a word problem, equation, or follow-up question..."
                      className={`flex-1 text-sm rounded-xl px-4 py-2.5 border outline-none ${
                        darkMode
                          ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500 focus:border-indigo-500'
                          : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={aiLoading || (!aiInput.trim() && !uploadedImage)}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-sm flex items-center gap-1.5 transition-all"
                    >
                      <Send className="w-4 h-4" />
                      <span className="hidden sm:inline">Ask AI</span>
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ==========================================
                TAB 2: FAVORITE FORMULAS & INTERACTIVE RUNNER
            ========================================== */}
            {activeTab === 'formulas' && (
              <div className="flex-1 p-5 flex flex-col gap-5 overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-base">Favorite Formulas & Interactive Templates</h2>
                    <p className="text-xs opacity-60">
                      Plug in variables to evaluate complex engineering, finance, and physics formulas.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowNewFormulaModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Custom Formula</span>
                  </button>
                </div>

                {/* Interactive Formula Runner Box if a formula is selected */}
                {selectedFormula && (
                  <div
                    className={`rounded-2xl p-4 border space-y-4 ${
                      darkMode
                        ? 'bg-indigo-950/25 border-indigo-500/40'
                        : 'bg-indigo-50/70 border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                          {selectedFormula.category}
                        </span>
                        <h3 className="font-bold text-base mt-1">{selectedFormula.name}</h3>
                        <p className="text-xs opacity-70">{selectedFormula.description}</p>
                      </div>
                      <button
                        onClick={() => setSelectedFormula(null)}
                        className="p-1.5 rounded-lg hover:bg-slate-800/40"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="font-mono text-xs px-3 py-2 rounded-xl bg-slate-950/60 text-indigo-300 border border-slate-800">
                      Template: {selectedFormula.formulaTemplate}
                    </div>

                    {/* Variable Inputs */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(selectedFormula.variables || []).map((v) => (
                        <div key={v.symbol} className="space-y-1">
                          <label className="text-xs font-semibold opacity-75 block">
                            {v.label} ({v.symbol})
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={formulaVarValues[v.symbol] ?? ''}
                            onChange={(e) =>
                              setFormulaVarValues((prev) => ({
                                ...prev,
                                [v.symbol]: e.target.value
                              }))
                            }
                            className={`w-full px-3 py-2 rounded-xl border font-mono text-sm outline-none ${
                              darkMode
                                ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                                : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                            }`}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Evaluated Output & Load to Calculator */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-indigo-500/20">
                      <div>
                        <span className="text-xs opacity-60 block">
                          Substituted: {evaluateSelectedFormula.substituted}
                        </span>
                        <span className="text-lg font-extrabold font-mono text-emerald-400">
                          Result = {evaluateSelectedFormula.result}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setExpression(evaluateSelectedFormula.substituted);
                          setDisplayResult(evaluateSelectedFormula.result);
                          showToast('Formula loaded into calculator!');
                        }}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <CornerDownLeft className="w-3.5 h-3.5" />
                        <span>Send to Calculator</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Grid of Formulas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {allFormulas.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => openFormulaRunner(item)}
                      className={`group rounded-2xl p-4 border cursor-pointer transition-all flex flex-col justify-between ${
                        selectedFormula?.id === item.id
                          ? 'border-indigo-500 ring-1 ring-indigo-500/40'
                          : darkMode
                          ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          : 'bg-slate-50 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">
                            {item.category}
                          </span>
                          {!item.isPreset && (
                            <button
                              onClick={(e) => deleteSavedFormula(item.id, e)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 p-1"
                              title="Delete custom formula"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <h4 className="font-bold text-sm">{item.name}</h4>
                        <p className="text-xs opacity-60 mt-0.5 line-clamp-2">{item.description}</p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/40 flex items-center justify-between">
                        <code className="text-xs font-mono text-indigo-400 truncate max-w-[200px]">
                          {item.formulaTemplate}
                        </code>
                        <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
                          <Play className="w-3 h-3" /> Use
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ==========================================
                TAB 3: PERSISTENT CLOUD CALCULATION HISTORY
            ========================================== */}
            {activeTab === 'history' && (
              <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-base">Cloud Calculation History</h2>
                    <p className="text-xs opacity-60">
                      Automatically synced across sessions. Click any entry to reuse or ask AI.
                    </p>
                  </div>
                  {historyItems.length > 0 && (
                    <button
                      onClick={clearAllHistory}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                {historyItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-12 opacity-50 space-y-2">
                    <History className="w-10 h-10 stroke-1" />
                    <p className="text-sm font-medium">No calculations saved yet</p>
                    <p className="text-xs">
                      Perform calculations on the keypad or via the Natural Language bar.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {historyItems.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-2xl p-4 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          darkMode
                            ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-500/15 opacity-70">
                              {item.angleMode || 'DEG'}
                            </span>
                            <span className="text-xs opacity-50">
                              {item.timestamp
                                ? new Date(item.timestamp).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : ''}
                            </span>
                          </div>
                          <div className="font-mono text-sm opacity-85">{item.expression}</div>
                          <div className="font-mono text-xl font-bold text-indigo-400">
                            = {item.result}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            onClick={() => {
                              setExpression(item.expression);
                              setDisplayResult(item.result);
                              showToast('Calculation restored to display');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 text-xs font-semibold flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Reload</span>
                          </button>
                          <button
                            onClick={() => {
                              setActiveTab('assistant');
                              handleSendThreadMessage(
                                null,
                                `Explain step-by-step how ${item.expression} evaluates to ${item.result}.`
                              );
                            }}
                            className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-400 text-xs font-semibold flex items-center gap-1"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>AI Explain</span>
                          </button>
                          <button
                            onClick={() => deleteHistoryItem(item.id)}
                            className="p-1.5 rounded-xl hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ==========================================
                TAB 4: INTERACTIVE FUNCTION GRAPHER
            ========================================== */}
            {activeTab === 'graph' && (
              <div className="flex-1 p-5 flex flex-col gap-4 overflow-y-auto">
                <div>
                  <h2 className="font-bold text-base">Interactive Function Grapher f(x)</h2>
                  <p className="text-xs opacity-60">
                    Visualize single-variable functions in real time using your current angle mode ({isDegree ? 'DEG' : 'RAD'}).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold opacity-70 block mb-1">
                      Function f(x) =
                    </label>
                    <input
                      type="text"
                      value={graphFunction}
                      onChange={(e) => setGraphFunction(e.target.value)}
                      placeholder="e.g. sin(x) * x or x^2 - 4"
                      className={`w-full px-3.5 py-2 rounded-xl border font-mono text-sm outline-none ${
                        darkMode
                          ? 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500'
                          : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold opacity-70 block mb-1">Min X</label>
                    <input
                      type="number"
                      value={graphDomain.min}
                      onChange={(e) =>
                        setGraphDomain((prev) => ({ ...prev, min: Number(e.target.value) }))
                      }
                      className={`w-full px-3 py-2 rounded-xl border font-mono text-sm outline-none ${
                        darkMode
                          ? 'bg-slate-950 border-slate-800 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold opacity-70 block mb-1">Max X</label>
                    <input
                      type="number"
                      value={graphDomain.max}
                      onChange={(e) =>
                        setGraphDomain((prev) => ({ ...prev, max: Number(e.target.value) }))
                      }
                      className={`w-full px-3 py-2 rounded-xl border font-mono text-sm outline-none ${
                        darkMode
                          ? 'bg-slate-950 border-slate-800 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>

                {/* Preset Functions */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Damped Sine', fn: 'sin(x) * x', min: -15, max: 15 },
                    { label: 'Parabola', fn: 'x^2 - 4*x - 5', min: -6, max: 10 },
                    { label: 'Gaussian Bell', fn: 'e^(-0.2 * x^2)', min: -6, max: 6 },
                    { label: 'Cubic Wave', fn: '0.1*x^3 - x', min: -5, max: 5 }
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => {
                        setGraphFunction(p.fn);
                        setGraphDomain({ min: p.min, max: p.max });
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        darkMode
                          ? 'bg-slate-950 border-slate-800 hover:border-indigo-500/50 text-slate-300'
                          : 'bg-slate-100 border-slate-200 hover:border-indigo-400 text-slate-700'
                      }`}
                    >
                      {p.label}: <code className="text-indigo-400">{p.fn}</code>
                    </button>
                  ))}
                </div>

                {/* SVG Plot Area */}
                <div
                  className={`flex-1 min-h-[280px] rounded-2xl border p-4 flex flex-col justify-between relative overflow-hidden ${
                    darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {graphPoints.valid ? (
                    <svg
                      viewBox="0 0 500 260"
                      className="w-full h-full overflow-visible"
                      preserveAspectRatio="none"
                    >
                      {/* Axes */}
                      {graphPoints.zeroX !== null && (
                        <line
                          x1={graphPoints.zeroX}
                          y1={0}
                          x2={graphPoints.zeroX}
                          y2={260}
                          stroke="currentColor"
                          strokeOpacity="0.2"
                          strokeWidth="1.5"
                        />
                      )}
                      {graphPoints.zeroY !== null && (
                        <line
                          x1={0}
                          y1={graphPoints.zeroY}
                          x2={500}
                          y2={graphPoints.zeroY}
                          stroke="currentColor"
                          strokeOpacity="0.2"
                          strokeWidth="1.5"
                        />
                      )}
                      {/* Function Curve */}
                      <path
                        d={graphPoints.path}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs opacity-50">
                      Enter a valid function of x (e.g., x^2 - 4) to plot.
                    </div>
                  )}

                  <div className="flex justify-between text-[11px] font-mono opacity-60 pt-2 border-t border-slate-800/40">
                    <span>
                      X: [{graphPoints.minX}, {graphPoints.maxX}]
                    </span>
                    <span>
                      Y: [{graphPoints.minY?.toFixed(2)}, {graphPoints.maxY?.toFixed(2)}]
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* MODAL FOR SAVING A NEW CUSTOM FORMULA */}
      {showNewFormulaModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-3xl border p-6 space-y-4 shadow-2xl ${
              darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-indigo-400" />
                Save Custom Formula
              </h3>
              <button
                onClick={() => setShowNewFormulaModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomFormula} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold block mb-1">Formula Name</label>
                <input
                  type="text"
                  required
                  value={newFormulaForm.name}
                  onChange={(e) => setNewFormulaForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Cylinder Volume"
                  className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                    darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Category</label>
                  <input
                    type="text"
                    value={newFormulaForm.category}
                    onChange={(e) => setNewFormulaForm((p) => ({ ...p, category: e.target.value }))}
                    placeholder="Geometry, Finance..."
                    className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                      darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1">Variables (sym:default)</label>
                  <input
                    type="text"
                    value={newFormulaForm.variablesRaw}
                    onChange={(e) =>
                      setNewFormulaForm((p) => ({ ...p, variablesRaw: e.target.value }))
                    }
                    placeholder="r:5, h:10"
                    className={`w-full px-3.5 py-2.5 rounded-xl border font-mono outline-none ${
                      darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold block mb-1">Mathematical Expression Template</label>
                <input
                  type="text"
                  required
                  value={newFormulaForm.formulaTemplate}
                  onChange={(e) =>
                    setNewFormulaForm((p) => ({ ...p, formulaTemplate: e.target.value }))
                  }
                  placeholder="pi * r^2 * h"
                  className={`w-full px-3.5 py-2.5 rounded-xl border font-mono outline-none ${
                    darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Short Description</label>
                <input
                  type="text"
                  value={newFormulaForm.description}
                  onChange={(e) =>
                    setNewFormulaForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Calculates volume of a right circular cylinder"
                  className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                    darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewFormulaModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Save to Cloud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
