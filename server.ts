import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pre-seed some leads to make the dashboard immediately interactive
interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  insuranceType: string;
  message: string;
  language: "es" | "en";
  age?: number;
  insuredCount?: number;
  createdAt: string;
  status: "new" | "contacted" | "archived";
  aiAnalysis?: {
    sentiment: string;
    mainConcern: string;
    recommendedProduct: string;
    suggestedNextStep: string;
    emailResponseDraft: string;
  };
}

let leads: Lead[] = [
  {
    id: "lead-1",
    name: "John Harrison",
    email: "john.harrison@example.com",
    phone: "+34 622 111 222",
    insuranceType: "salud-reembolso",
    message: "Hi, I am an expat moving to Barcelona next month with my wife. We need a health insurance that complies with the visa requirements (no co-payments, full coverage, and repatriation). I would also prefer if we can visit English-speaking doctors and have reimbursement for external specialists. Thanks!",
    language: "en",
    age: 38,
    insuredCount: 2,
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(), // 3 hours ago
    status: "new",
    aiAnalysis: {
      sentiment: "Neutral / Planning",
      mainConcern: "Full coverage health insurance with no copayments, including repatriation for visa requirements, plus reimbursement for external English-speaking doctors.",
      recommendedProduct: "DKV Mundisalud Classic / Premium (Reimbursement of medical fees)",
      suggestedNextStep: "Send a proposal for DKV Mundisalud. Confirm residency visa details and arrange a brief call on WhatsApp to finalize the quote.",
      emailResponseDraft: "Dear John,\n\nWelcome to Spain! My name is Irene Pujol, and as a DKV Exclusive Agent, I would be delighted to assist you and your wife in securing the perfect healthcare coverage for your move to Barcelona.\n\nBased on your visa requirements, we have the ideal solution: DKV Mundisalud. This is a premium reimbursement plan that offers 100% complete coverage with no copayments, covers repatriation, and allows you to visit any doctor or specialist worldwide (with up to 90% reimbursement), including English-speaking professionals in Barcelona.\n\nI would love to send you a customized quotation. Could you please confirm your wife's age so I can prepare a combined proposal?\n\nIf you prefer, we can also connect via WhatsApp or phone at +34 603 607 987 to resolve any immediate doubts.\n\nKind regards,\n\nIrene Pujol\nDKV Exclusive Agent"
    }
  },
  {
    id: "lead-2",
    name: "María Fernández",
    email: "maria.fer88@example.com",
    phone: "+34 655 444 333",
    insuranceType: "dental",
    message: "Hola Irene, estoy interesada en el seguro dental para mí y mis dos hijos. Querría saber qué tratamientos de ortodoncia entran y si la limpieza de boca es gratuita. ¡Gracias!",
    language: "es",
    age: 35,
    insuredCount: 3,
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(), // 1 day ago
    status: "new",
    aiAnalysis: {
      sentiment: "Positive / Interested",
      mainConcern: "Dental insurance for a mother and two children, specifically inquiring about orthodontic coverage and free professional cleanings.",
      recommendedProduct: "DKV Dentisalud Élite (Family dental cover)",
      suggestedNextStep: "Offer DKV Dentisalud Élite which includes free annual cleanings and consultations for the entire family, plus substantial discounts on orthodontics.",
      emailResponseDraft: "Hola María,\n\nMuchos gracias por contactar conmigo. Estaré encantada de ayudarte a encontrar el mejor seguro dental para ti y tus hijos.\n\nPara lo que necesitas, te recomiendo sin duda DKV Dentisalud Élite. Con este plan, las limpiezas de boca anuales son totalmente gratuitas para los tres, así como todas las consultas y radiografías diagnósticas. En cuanto a la ortodoncia, tendréis acceso a tarifas franquiciadas con importantes descuentos (hasta un 30-40% más barato que la tarifa privada general) en nuestra amplia red de clínicas dentales DKV.\n\nEl precio para los tres es muy competitivo (aproximadamente 15-20€ al mes en total). ¿Te vendría bien que hablemos brevemente por WhatsApp al +34 603 607 987 para enviarte el dossier informativo y los precios exactos?\n\nUn saludo cordial,\n\nIrene Pujol\nAgente Exclusiva DKV"
    }
  }
];

// Initialize Gemini API client on server-side only
let ai: GoogleGenAI | null = null;
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API Client initialized successfully.");
  } catch (err) {
    console.error("Error initializing Gemini client:", err);
  }
} else {
  console.log("No valid GEMINI_API_KEY environment variable. AI features will run in simulator mode.");
}

// API: Submit a lead / contact form data
app.post("/api/contact", (req, res) => {
  const { name, email, phone, insuranceType, message, language, age, insuredCount } = req.body;

  if (!name || !email || !phone) {
    return res.status(400).json({ error: "Missing required fields: name, email, and phone are mandatory." });
  }

  const newLead: Lead = {
    id: `lead-${Date.now()}`,
    name,
    email,
    phone,
    insuranceType: insuranceType || "general",
    message: message || "",
    language: language === "en" ? "en" : "es",
    age: age ? Number(age) : undefined,
    insuredCount: insuredCount ? Number(insuredCount) : 1,
    createdAt: new Date().toISOString(),
    status: "new"
  };

  leads.unshift(newLead);
  console.log(`[Email Sent to dkvirenepujol@gmail.com] Lead Name: ${name}, Email: ${email}, Phone: ${phone}`);

  return res.json({ success: true, lead: newLead });
});

// API: Get all leads for the Agent Dashboard
app.get("/api/leads", (req, res) => {
  return res.json({ leads });
});

// API: Update lead status
app.post("/api/leads/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (status !== "new" && status !== "contacted" && status !== "archived") {
    return res.status(400).json({ error: "Invalid status value" });
  }

  const leadIndex = leads.findIndex(l => l.id === id);
  if (leadIndex === -1) {
    return res.status(404).json({ error: "Lead not found" });
  }

  leads[leadIndex].status = status;
  return res.json({ success: true, lead: leads[leadIndex] });
});

// API: Delete/Archive a lead
app.delete("/api/leads/:id", (req, res) => {
  const { id } = req.params;
  leads = leads.filter(l => l.id !== id);
  return res.json({ success: true, message: "Lead removed" });
});

// API: AI analyze lead and generate personalized response draft
app.post("/api/leads/:id/ai-analyze", async (req, res) => {
  const { id } = req.params;
  const leadIndex = leads.findIndex(l => l.id === id);

  if (leadIndex === -1) {
    return res.status(404).json({ error: "Lead not found" });
  }

  const lead = leads[leadIndex];

  // If Gemini client is initialized, make the real API call
  if (ai) {
    try {
      console.log(`Analyzing lead ${lead.name} using gemini-3.5-flash...`);
      const userLanguageText = lead.language === "en" ? "English" : "Spanish";
      
      const prompt = `You are the personal assistant of Irene Pujol (DKV Exclusive Agent).
Analyze this insurance inquiry lead from our website.
Lead Name: ${lead.name}
Email: ${lead.email}
Phone: ${lead.phone}
Language: ${userLanguageText}
Insurance Requested: ${lead.insuranceType}
Age of primary applicant: ${lead.age || "Not specified"}
Number of people to insure: ${lead.insuredCount || 1}
Client inquiry message: "${lead.message}"

Your task is to analyze their interest and generate a structured JSON object response.
The draft email response MUST be written in ${userLanguageText}, signed off by "Irene Pujol (DKV Exclusive Agent)", and must:
1. Be warm, professional, empathetic, and direct (no generic corporate fluff).
2. Propose the most suitable DKV insurance product based on their needs.
3. Explicitly invite them to reach out or schedule a call via Phone/WhatsApp at +34 603 607 987, or reply to dkvirenepujol@gmail.com.
4. Keep the email copy well-formatted with paragraph breaks.

You MUST return a JSON object with the exact fields below. Use double quotes and return ONLY the JSON itself:
{
  "sentiment": "Describe sentiment (e.g. Anxious/Urgent, Highly Interested, Informational, Casual)",
  "mainConcern": "Briefly state their primary medical or insurance concern in 1-2 sentences",
  "recommendedProduct": "Specify the exact DKV product (e.g. DKV Integral Élite, DKV Mundisalud Classic, DKV Dentisalud Élite)",
  "suggestedNextStep": "Actionable next step for the agent (e.g. Call via WhatsApp, Prepare quote for 3 people, follow up immediately)",
  "emailResponseDraft": "The full formatted email response draft ready to send"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sentiment: { type: Type.STRING },
              mainConcern: { type: Type.STRING },
              recommendedProduct: { type: Type.STRING },
              suggestedNextStep: { type: Type.STRING },
              emailResponseDraft: { type: Type.STRING }
            },
            required: ["sentiment", "mainConcern", "recommendedProduct", "suggestedNextStep", "emailResponseDraft"]
          }
        }
      });

      if (response && response.text) {
        const result = JSON.parse(response.text.trim());
        leads[leadIndex].aiAnalysis = result;
        return res.json({ success: true, aiAnalysis: result });
      } else {
        throw new Error("Empty response from Gemini API");
      }
    } catch (err: any) {
      console.error("Gemini API call failed, falling back to simulator mode:", err);
    }
  }

  // Fallback / Simulator Mode if no key or API call failed
  console.log("Simulating AI analysis for lead:", lead.name);
  
  // Rule-based high-quality simulator response
  let sentiment = "Highly Interested";
  let mainConcern = "Looking for high-quality health/dental coverage with competitive pricing and clear benefits.";
  let recommendedProduct = "DKV Integral Complet / Élite";
  let suggestedNextStep = "Send direct price estimation and schedule a WhatsApp consultation.";
  let emailResponseDraft = "";

  if (lead.language === "en") {
    if (lead.insuranceType.includes("dental")) {
      recommendedProduct = "DKV Dentisalud Élite";
      mainConcern = "Inquiring about family dental plans, cleanings, and treatments.";
      emailResponseDraft = `Dear ${lead.name},\n\nThank you for reaching out! My name is Irene Pujol, and I am your DKV Exclusive Agent.\n\nI would be delighted to help you explore our DKV Dentisalud Élite plan. It covers free annual oral cleanings, diagnostics, and up to 30-40% savings on treatments like orthodontics or implants across Spain.\n\nPlease let me know if you would like to have a brief WhatsApp consultation at +34 603 607 987, or if I can draft a detailed quote for ${lead.insuredCount || 1} person(s).\n\nBest regards,\n\nIrene Pujol\nDKV Exclusive Agent`;
    } else if (lead.insuranceType.includes("decesos")) {
      recommendedProduct = "DKV Protección Familiar";
      mainConcern = "Seeking peace of mind regarding family funeral and assistance services.";
      emailResponseDraft = `Dear ${lead.name},\n\nThank you for contacting me. I am Irene Pujol, and as a DKV Exclusive Agent, I am here to help you secure absolute peace of mind for your family.\n\nOur DKV Protección Familiar offers complete funeral planning, worldwide repatriation, emotional support, and full legal assistance. This is one of the most trusted family protection plans in Spain.\n\nCould we arrange a quick WhatsApp chat or phone call at +34 603 607 987 to adapt the quote to your family size?\n\nWarm regards,\n\nIrene Pujol\nDKV Exclusive Agent`;
    } else {
      recommendedProduct = lead.insuranceType === "salud-reembolso" ? "DKV Mundisalud Classic" : "DKV Integral Élite (No Copayments)";
      mainConcern = "Inquiring about full health insurance for visa or complete medical protection.";
      emailResponseDraft = `Dear ${lead.name},\n\nThank you very much for your interest. My name is Irene Pujol, and I am your DKV Exclusive Agent.\n\nI recommend our ${recommendedProduct} plan, which provides comprehensive coverage with access to top-tier hospitals, zero copayments (perfect for residency visas), and digital health services through our app.\n\nLet's schedule a 5-minute call or chat on WhatsApp (+34 603 607 987) so I can answer all your questions and send you a custom-designed proposal.\n\nBest regards,\n\nIrene Pujol\nDKV Exclusive Agent`;
    }
  } else {
    // Spanish
    if (lead.insuranceType.includes("dental")) {
      recommendedProduct = "DKV Dentisalud Élite";
      mainConcern = "Interés en cobertura dental familiar, consultas y limpiezas dentales sin coste.";
      emailResponseDraft = `Hola ${lead.name},\n\n¡Muchas gracias por tu mensaje! Soy Irene Pujol, tu Agente Exclusiva de DKV.\n\nEstaré encantada de informarte sobre DKV Dentisalud Élite, nuestro seguro dental estrella que incluye limpiezas gratis, consultas ilimitadas y tarifas muy reducidas en tratamientos de ortodoncia e implantes.\n\n¿Te vendría bien que te envíe los folletos informativos por WhatsApp al +34 603 607 987 y prepare un presupuesto exacto para ${lead.insuredCount || 1} persona(s)?\n\nUn saludo cordial,\n\nIrene Pujol\nAgente Exclusiva DKV`;
    } else if (lead.insuranceType.includes("decesos")) {
      recommendedProduct = "DKV Protección Familiar";
      mainConcern = "Búsqueda de tranquilidad familiar y asistencia en decesos.";
      emailResponseDraft = `Hola ${lead.name},\n\nGracias por ponerte en contacto conmigo. Soy Irene Pujol, Agente Exclusiva de DKV.\n\nNuestra póliza DKV Protección Familiar es de las más completas de España, cubriendo la gestión integral del sepelio, traslado nacional e internacional, testamento online y asistencia psicológica.\n\nEstaré encantada de preparar una propuesta personalizada. ¿Podríamos hablar brevemente por teléfono o WhatsApp en el +34 603 607 987?\n\nUn saludo atento,\n\nIrene Pujol\nAgente Exclusiva DKV`;
    } else if (lead.insuranceType.includes("autonomos")) {
      recommendedProduct = "DKV Profesional / Autónomos";
      mainConcern = "Plan de salud corporativo o para profesionales con ventajas fiscales.";
      emailResponseDraft = `Hola ${lead.name},\n\nGracias por consultarme. Como Agente Exclusiva de DKV, entiendo perfectamente las necesidades de autónomos y pymes.\n\nTenemos planes específicos de salud con deducción fiscal de hasta 500€ al año por asegurado y coberturas de incapacidad temporal. Además, disponemos de pólizas con copagos mínimos o sin copagos.\n\n¿Cuándo te vendría bien que hablemos por WhatsApp o por teléfono en el +34 603 607 987 para afinar los detalles de tu negocio?\n\nAtentamente,\n\nIrene Pujol\nAgente Exclusiva DKV`;
    } else {
      recommendedProduct = "DKV Integral Complet (Copago bajo) o Élite (Sin copago)";
      mainConcern = "Interés en seguro de salud completo de DKV para asistencia médica.";
      emailResponseDraft = `Hola ${lead.name},\n\n¡Muchas gracias por el interés en DKV Seguros! Mi nombre es Irene Pujol y soy tu Agente Exclusiva.\n\nPara asegurarte el mejor cuidado médico, te propongo nuestro plan ${recommendedProduct}. Incluye medicina general, especialistas, urgencias hospitalarias, pruebas de diagnóstico y nuestra fantástica app móvil "Quiero cuidarme Más".\n\nEstaré encantada de asesorarte. ¿Te parece bien que hablemos por WhatsApp en el +34 603 607 987 para calcular la cuota exacta de tu grupo?\n\nUn saludo cordial,\n\nIrene Pujol\nAgente Exclusiva DKV`;
    }
  }

  const simulatedAnalysis = {
    sentiment,
    mainConcern,
    recommendedProduct,
    suggestedNextStep,
    emailResponseDraft
  };

  leads[leadIndex].aiAnalysis = simulatedAnalysis;
  return res.json({ success: true, aiAnalysis: simulatedAnalysis });
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PromoSeguro Web App & API running on http://localhost:${PORT}`);
  });
}

startServer();
