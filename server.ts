import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));

// Initialize Gemini API
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
} else {
  console.warn("Warning: GEMINI_API_KEY environment variable is not set.");
}

function getAIClient() {
  if (!ai) {
    throw new Error("Gemini API Client is not initialized. Please verify your GEMINI_API_KEY secret in Settings > Secrets.");
  }
  return ai;
}

// 1. Text parser into Structured Engineering Estimate Sheets
app.post("/api/parse-estimate", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "No text provided to parse." });
    }

    const client = getAIClient();
    const prompt = `以下のテキストデータは、製造業向けの製品見積、または部材・加工費の構成明細仕様です。
この情報をパースして、精密な原価積算シートのJsonデータを抽出し、指定のJSONスキーマに従ってクリーンに構造化してください。

【対象テキスト】:
"""
${text}
"""`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: `あなたは精密金属加工および射出成形・機械加工見積を精査するプロフェッショナルバイヤーです。
テキストから、品番（品番に近しい英数字・ハイフン記号）、見積基準数、完成品重量、材料費情報（材質、投入量g、建値円/kg、スクラップ発生重量、スクラップ買取単価）、各加工工程（工順、工程名、作業内容、設備賃率、段取時間h、出来高個/h、直接加工費）、送料運賃（1箱の入数、箱あたり運賃）を特定して、極めて正確なJSONを出力してください。`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "品番や案件名など" },
            partNumber: { type: Type.STRING, description: "品番 (識別子)" },
            baseLotSize: { type: Type.NUMBER, description: "見積基準数 (ロット数)" },
            finishedWeightG: { type: Type.NUMBER, description: "完成品重量 (g)" },
            material: {
              type: Type.OBJECT,
              properties: {
                materialName: { type: Type.STRING, description: "材質・寸法 (例: SUS304 t2.0)" },
                inputWeightG: { type: Type.NUMBER, description: "材料投入量 (g)" },
                basePricePerKg: { type: Type.NUMBER, description: "建値 (円/kg)" },
                scrapWeightG: { type: Type.NUMBER, description: "スクラップ発生量 (g)" },
                scrapPricePerKg: { type: Type.NUMBER, description: "スクラップ単価 (円/kg)" }
              },
              required: ["materialName", "inputWeightG", "basePricePerKg"]
            },
            items: {
              type: Type.ARRAY,
              description: "検出された加工・生産工程の一覧。通常2〜10工程",
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING, description: "材料費、加工費、物流費、設定初期費などの区分" },
                  name: { type: Type.STRING, description: "工程名（プレス、溶接、メッキ、検査、梱包等）" },
                  quantity: { type: Type.NUMBER, description: "作業時間や出来高、数量など" },
                  unitPrice: { type: Type.NUMBER, description: "単価（設備賃率、直接費）" },
                  notes: { type: Type.STRING, description: "工程の作業内容や詳細備考" }
                },
                required: ["category", "name", "quantity", "unitPrice"]
              }
            },
            logistics: {
              type: Type.OBJECT,
              properties: {
                qtyPerBox: { type: Type.NUMBER, description: "1箱の入数" },
                freightPerBox: { type: Type.NUMBER, description: "1箱の運賃" }
              }
            }
          },
          required: ["items"]
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (error: any) {
    console.error("Error in parse-estimate:", error);
    res.status(500).json({ error: error.message || "Failed to parse estimate text." });
  }
});

// 2. Pure Cost Auditer and Battle-Card Playbook Generator
app.post("/api/compare-estimates", async (req, res) => {
  try {
    const { oldEstimate, newEstimate } = req.body;
    if (!oldEstimate || !newEstimate) {
      return res.status(400).json({ error: "Both old and new detailed estimates are required." });
    }

    const client = getAIClient();
    const prompt = `あなたは、自動車メーカー、日用品メーカー、または精密機械装置トップメーカーの「調達購買本部シニアマネージャー」かつ「原価監査オフィサー」です。
サプライヤーから提出された「旧見積（現行価格）」と「新見積（最新値上げ改定案）」の精密設計ブレークダウンデータを元に、単価変動の主因を分析し、得意先（または社内役員メンバー）に向けた【新旧価格監査報告書】ならびに【調達バイヤー向けの交渉アジェンダ・カウンターアプローチ】を作成してください。

新旧見積は『品番: ${newEstimate.partNumber}』に対するものです。

■ 旧見積（現行モデル）:
${JSON.stringify(oldEstimate, null, 2)}

■ 新見積（改定提示モデル）:
${JSON.stringify(newEstimate, null, 2)}

【分析観点要件】:
- スクラップ重量・投入材料、建値の相関値に基づいた実質材料費変動の正当性評価（例：LMEや国内建値の指標変動と一致しているか、それ以上の便乗がないか）
- 新旧で工順（設備加工、作業時間、あるいは出来高数）のパラメータ変更はあるか。賃率の上昇（およそ労務費・電力代）の上昇は日本の社会・インデックス（+5%〜+15%程度）から見て破綻していないか
- 2024年問題などの運賃上昇の影響。1箱あたり運賃と入数の妥当な按分
- サプライヤーが金型償却、初期型費完了している項目についての適切な減資を促すカウンターアジェンダ
- バイヤーが実際の価格折衝において、サプライヤーに投げかけるべき「強力で論理的な具体的・逆質問」5選（アジェンダとしてバイヤーがコピー・利用可能）`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "あなたはサプライヤーとの購買協議で絶対的な勝利を収める購買コンサルタントです。日本の商習慣、下請法、相場のインデックスに精通し、言い値での回答を徹底的に論破し、合理的なVE（バリューエンジニアリング）や分配歩み寄りを模索する実践的かつ最高水準のアドバイスを行います。すべて流暢な日本語で出力してください。",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "新旧比較 of 総合結論。上昇原因や解説等" },
            keyChanges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "主要な価格高騰・削減要素" },
                  description: { type: Type.STRING, description: "詳細な解説" },
                  impact: { type: Type.STRING, description: "'negative', 'positive' or 'neutral'" }
                },
                required: ["title", "description", "impact"]
              }
            },
            reasonablenessAssessment: { type: Type.STRING, description: "価格改定に対する妥当性の監査結論。" },
            negotiationTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "交渉メールや協議、逆確認のための質問事項5選"
            },
            categoryAnalysisPoints: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  analysis: { type: Type.STRING }
                },
                required: ["category", "analysis"]
              }
            }
          },
          required: ["summary", "keyChanges", "reasonablenessAssessment", "negotiationTips", "categoryAnalysisPoints"]
        }
      }
    });

    const resultText = response.text || "{}";
    const comparisonResults = JSON.parse(resultText);
    res.json(comparisonResults);
  } catch (error: any) {
    console.error("Error in compare-estimates:", error);
    res.status(500).json({ error: error.message || "Failed to audit detailed estimates." });
  }
});

// 3. AI Estimate Generator from requirements prompt
app.post("/api/generate-estimate", async (req, res) => {
  try {
    const { prompt, conditions, spec } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Product requirements prompt is required." });
    }

    const client = getAIClient();
    const userPrompt = `以下の製品・加工要求、および条件に基づき、日本の下請加工賃率や金属価格相場に完全に等しい、妥当な詳細積算見積データを1件生成してください。

【製品仕様】: "${prompt}"
【生産・加工条件】: "${conditions || "特になし"}"
【原料・配送スペック】: "${spec || "特になし"}"`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: `あなたは製造原価（プレス板金、切削、溶接、プラスチック射出成形、めっき等）を算出する原価企画エキスパートです。
ユーザーから提供された仕様に近い、論理的に首尾一貫した製品見積構成データを作成してください。
- 材質と材料の各種重量、建値(SUS/鉄なら250〜500円/kg、アルミ/真鍮なら600〜1200円/kgなど)
- 仕上げ・加工工程：少なくとも3つか4つの論理的な工程。例：プレス抜きなら段取0.5h, 出来高500枚/h, 賃率2600円/h。スポット溶接なら段取0.4h, 出来高150本/h, 賃率3200円/h。
- 運賃：1箱あたり入数(50〜200個)と1箱運賃(800〜1500円)
- 利益率・価格：一般的な管理費目標としてsgaRatePercentに5〜15%程度。
これらを破綻なく構造化したJSON形式を返してください。`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            partNumber: { type: Type.STRING },
            baseLotSize: { type: Type.NUMBER },
            lotUnit: { type: Type.STRING },
            finishedWeightG: { type: Type.NUMBER },
            material: {
              type: Type.OBJECT,
              properties: {
                materialName: { type: Type.STRING },
                inputWeightG: { type: Type.NUMBER },
                basePricePerKg: { type: Type.NUMBER },
                scrapWeightG: { type: Type.NUMBER },
                scrapPricePerKg: { type: Type.NUMBER }
              },
              required: ["materialName", "inputWeightG", "basePricePerKg"]
            },
            processes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.NUMBER },
                  processName: { type: Type.STRING },
                  workContent: { type: Type.STRING },
                  hourlyRate: { type: Type.NUMBER },
                  totalHours: { type: Type.NUMBER },
                  yieldPerHour: { type: Type.NUMBER }
                },
                required: ["index", "processName", "hourlyRate", "totalHours", "yieldPerHour"]
              }
            },
            logistics: {
              type: Type.OBJECT,
              properties: {
                qtyPerBox: { type: Type.NUMBER },
                freightPerBox: { type: Type.NUMBER }
              },
              required: ["qtyPerBox", "freightPerBox"]
            },
            adjustments: {
              type: Type.OBJECT,
              properties: {
                targetProfitRate: { type: Type.NUMBER },
                targetUnitPrice: { type: Type.NUMBER },
                actualPurchasePrice: { type: Type.NUMBER },
                sgaRatePercent: { type: Type.NUMBER },
                toolingCost: { type: Type.NUMBER }
              }
            }
          },
          required: ["partNumber", "material", "processes", "logistics"]
        }
      }
    });

    const generatedData = JSON.parse(response.text || "{}");
    res.json(generatedData);
  } catch (error: any) {
    console.error("Error in generate-estimate:", error);
    res.status(500).json({ error: error.message || "Failed to generate estimate." });
  }
});

// Setup Vite Dev Middleware or Serve Static Files in Production
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
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Estimate Comparison Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
