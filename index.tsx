import { GoogleGenAI, Modality } from "@google/genai";
import React, { useState, useCallback, CSSProperties, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// =====================================================================
// DEFINA OS COMPONENTES FORA DO COMPONENTE PRINCIPAL
// =====================================================================

// FIX: Estes componentes estavam definidos dentro do App, fazendo com que fossem recriados em cada renderização.
// Mover para fora garante que a sua identidade seja estável, prevenindo desmontagens desnecessárias e perda de estado (como o foco do input).

const AccordionItem: React.FC<{
  title: string;
  accordionKey: string;
  activeAccordion: string;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}> = ({ title, accordionKey, activeAccordion, onToggle, children }) => (
  <div style={styles.accordionItem}>
    <button style={styles.accordionHeader} onClick={() => onToggle(accordionKey)}>
      {title}
      <span>{activeAccordion === accordionKey ? '-' : '+'}</span>
    </button>
    {activeAccordion === accordionKey && (
      <div style={styles.accordionContent}>
        {children}
      </div>
    )}
  </div>
);
  
const ToolOption: React.FC<{
  tool: string;
  label: string;
  activeTool: string;
  loadingTool: string;
  onSelect: (tool: string) => void;
  onApply: () => void;
  children?: React.ReactNode; // Tornar children opcional
}> = ({ tool, label, activeTool, loadingTool, onSelect, onApply, children }) => (
  <div 
    className="tool-card" 
    style={{ ...styles.toolCard, ...(activeTool === tool ? styles.activeToolCard : {}) }} 
    onClick={() => onSelect(tool)}
  >
    <div style={styles.toolHeader}>
        <h4 style={styles.toolTitle}>{label}</h4>
        {activeTool === tool && (
          <button
            className="apply-tool-button"
            style={styles.applyToolButton}
            onClick={(e) => {
              e.stopPropagation(); // Previne que o onClick do div pai dispare novamente
              onApply();
            }}
            disabled={loadingTool !== ''}
          >
            {loadingTool === tool ? 'A aplicar...' : 'Aplicar'}
          </button>
        )}
    </div>
    {children && <div style={styles.toolBody}>{children}</div>}
  </div>
);


const App = () => {
  const [originalImage, setOriginalImage] = useState(null);
  const [editedImage, setEditedImage] = useState(null);
  const [loadingTool,setLoadingTool] = useState('');
  const [error, setError] = useState<{title: string, message: string} | null>(null);
  
  const [activeAccordion, setActiveAccordion] = useState('');
  const [activeTool, setActiveTool] = useState('');
  const [isPeekingOriginal, setIsPeekingOriginal] = useState(false);

  // Viewport state for zoom and pan
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPanPositionRef = useRef({ x: 0, y: 0 });


  // Tool-specific state
  const [hairColor, setHairColor] = useState('#ff0000');
  const [hairStyle, setHairStyle] = useState('liso e sedoso');

  const [eyeColor, setEyeColor] = useState('#4682b4');
  const [eyeShape, setEyeShape] = useState('amendoados');

  const [clothingTargetForColor, setClothingTargetForColor] = useState('camisa');
  const [clothingColor, setClothingColor] = useState('#00ff00');
  
  const [clothingTargetForSwap, setClothingTargetForSwap] = useState('calças');
  const [clothingReferenceImage, setClothingReferenceImage] = useState(null);

  const [clothingTargetForPattern, setClothingTargetForPattern] = useState('camisa');
  const [patternPrompt, setPatternPrompt] = useState('listras verticais azuis');
  const [patternImage, setPatternImage] = useState(null);
  const [removePatternTarget, setRemovePatternTarget] = useState('camisa');


  const originalImageInputRef = useRef(null);
  const referenceImageInputRef = useRef(null);
  const patternImageInputRef = useRef(null);
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const fileToGenerativePart = async (file) => {
    const base64EncodedDataPromise = new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result.split(',')[1]);
        } else {
          reject(new Error('Falha ao ler o ficheiro como URL de dados.'));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  };
  
  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleImageUpload = (setter) => (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result);
      };
      reader.readAsDataURL(file);
      if (setter === setOriginalImage) {
        setEditedImage(null);
        setError(null);
        resetView();
      }
    }
  };

  const applyEdit = async () => {
    const baseImage = editedImage || originalImage;
    if (!baseImage || !activeTool) return;

    setLoadingTool(activeTool);
    setError(null);
    
    try {
      let prompt = '';
      const contents = { parts: [] };
      const imageToEditFile = await (await fetch(baseImage)).blob();
      const imageToEditPart = await fileToGenerativePart(imageToEditFile);
      contents.parts.push(imageToEditPart);

      switch(activeTool) {
        // ========== HAIR CASES ==========
        case 'hair-color':
           prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões (largura e altura em pixels) da imagem original. Nenhum corte ou distorção é permitido.
2.  **EDIÇÃO RESTRITA AO CABELO:** A única modificação permitida é a cor do cabelo na cabeça. A nova cor é ${hairColor}.
3.  **PRESERVAÇÃO MÁXIMA:** TODOS os outros elementos DEVEM permanecer 100% IDÊNTICOS e INALTERADOS. Isto inclui:
    - O rosto, o formato do corpo, a pose e o tom de pele DEVEM ser preservados sem a MÍNIMA alteração.
    - A cor das sobrancelhas NÃO PODE ser alterada.
    - A textura, o volume e o estilo do cabelo original devem ser mantidos.
    - Roupas e fundo devem permanecer intocados.
    - A iluminação, sombras e reflexos originais da cena DEVEM ser preservados.
4.  **APLICAÇÃO REALISTA:** A nova cor deve ser aplicada de forma natural, respeitando as mechas, luzes e sombras do cabelo original.`;
           contents.parts.push({ text: prompt });
           break;
        case 'hair-style':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões (largura e altura em pixels) da imagem original. Nenhum corte ou distorção é permitido.
2.  **EDIÇÃO RESTRITA AO ESTILO DO CABELO:** A única modificação permitida é o estilo do cabelo na cabeça. O novo estilo é '${hairStyle}'.
3.  **PRESERVAÇÃO MÁXIMA:** TODOS os outros elementos DEVEM permanecer 100% IDÊNTICOS e INALTERADOS. Isto inclui:
    - O rosto, o formato do corpo, a pose e o tom de pele DEVEM ser preservados sem a MÍNIMA alteração.
    - A COR original do cabelo, a cor das sobrancelhas, roupas e o fundo devem permanecer intocados.
    - A iluminação e sombras originais da cena DEVEM ser preservados.
4.  **APLICAÇÃO REALISTA:** O novo penteado deve parecer natural na pessoa, respeitando a forma da cabeça e a iluminação.`;
          contents.parts.push({ text: prompt });
          break;

        // ========== EYES CASES ==========
        case 'eye-color':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA:
1.  **MICRO-EDIÇÃO:** A única alteração permitida é a COR da íris dos olhos da pessoa. Altere a cor para ${eyeColor}.
2.  **PRESERVAÇÃO ABSOLUTA:** É PROIBIDO alterar qualquer outra coisa. O formato dos olhos, cílios, pálpebras, o rosto, a pele, o tom de pele, a expressão facial e todos os outros pixels da imagem DEVEM permanecer 100% IDÊNTICOS. Apenas a cor da íris muda. A imagem final deve ter dimensões idênticas à original.`;
          contents.parts.push({ text: prompt });
          break;
        case 'eye-shape':
           prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA:
1.  **MICRO-EDIÇÃO SUTIL:** A única alteração permitida é um ajuste SUTIL no FORMATO dos olhos da pessoa para que se assemelhem a '${eyeShape}'.
2.  **PRESERVAÇÃO ABSOLUTA:** É PROIBIDO alterar qualquer outra coisa. A COR dos olhos, cílios, pálpebras, o rosto, a pele, o tom de pele, a expressão facial e todos os outros pixels da imagem DEVEM permanecer 100% IDÊNTICOS. A modificação deve ser mínima e fotorrealista. A imagem final deve ter dimensões idênticas à original.`;
           contents.parts.push({ text: prompt });
           break;

        // ========== CLOTHING CASES ==========
        case 'clothing-color':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões (largura e altura em pixels) da imagem original. Nenhum corte ou distorção é permitido.
2.  **FOCO DA EDIÇÃO:** A única alteração permitida é a COR d${clothingTargetForColor === 'camisa' || clothingTargetForColor === 'vestido' ? 'a' : 'o'} ${clothingTargetForColor}. Altere a sua cor para ${clothingColor}.
3.  **PRESERVAÇÃO MÁXIMA:** TODOS os outros elementos DEVEM permanecer 100% IDÊNTICOS. Isto inclui:
    - O rosto, o formato do corpo, a pose e o tom de pele DEVEM ser preservados sem NENHUMA alteração.
    - A textura original do tecido, as dobras e as sombras DEVEM ser mantidas.
    - Todas as outras peças de roupa e o fundo devem permanecer intocados.
4.  **APLICAÇÃO REALISTA:** A nova cor deve ser aplicada sobre o tecido de forma natural, respeitando a iluminação e as sombras.`;
          contents.parts.push({ text: prompt });
          break;
        case 'clothing-swap':
          if (!clothingReferenceImage) throw new Error("Por favor, carregue uma imagem de referência para a troca de roupa.");
          const referenceImageFile = await (await fetch(clothingReferenceImage)).blob();
          const referenceImagePart = await fileToGenerativePart(referenceImageFile);
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões (largura e altura em pixels) da imagem original. Nenhum corte, redimensionamento, distorção ou adição de margens é permitido. Preserve 100% da área visível original.
2.  **FOCO DA EDIÇÃO:** Substitua APENAS a peça de roupa '${clothingTargetForSwap}' na pessoa da imagem principal. Use a roupa da imagem de referência como modelo visual.
3.  **PRESERVAÇÃO MÁXIMA:** TODOS os outros elementos DEVEM permanecer 100% IDÊNTICOS: o rosto, o corpo, a pose, o tom de pele, o fundo, a iluminação e TODAS as outras peças de roupa não mencionadas.
4.  **ORDEM DE CAMADAS (Z-ORDER):** A hierarquia de sobreposição das roupas DEVE ser MANTIDA. Se uma camisa estava por cima da calça, a nova roupa deve ser renderizada por baixo da camisa.
5.  **APLICAÇÃO REALISTA:** A nova roupa deve ajustar-se de forma realista às dobras, sombras e iluminação da foto original.`;
          contents.parts.push(referenceImagePart);
          contents.parts.push({ text: prompt });
          break;
        case 'clothing-pattern-remove':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões (largura e altura em pixels) da imagem original. Nenhum corte ou distorção é permitido.
2.  **FOCO DA EDIÇÃO:** Remova completamente qualquer estampa, logo ou padrão d${removePatternTarget === 'camisa' || removePatternTarget === 'vestido' ? 'a' : 'o'} ${removePatternTarget}, tornando-a de cor sólida (baseada na cor principal do tecido).
3.  **PRESERVAÇÃO MÁXIMA:** TODOS os outros elementos DEVEM permanecer 100% IDÊNTICOS:
    - O rosto, o corpo, a pose e o tom de pele DEVEM ser preservados sem NENHUMA alteração.
    - A textura do tecido, as dobras e as sombras DEVEM ser mantidas.
    - Todas as outras peças de roupa e o fundo devem permanecer intocados.`;
          contents.parts.push({ text: prompt });
          break;
        case 'clothing-pattern-add-prompt':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões (largura e altura em pixels) da imagem original. Nenhum corte ou distorção é permitido.
2.  **FOCO DA EDIÇÃO:** Aplique uma estampa de '${patternPrompt}' APENAS n${clothingTargetForPattern === 'camisa' || clothingTargetForPattern === 'vestido' ? 'a' : 'o'} ${clothingTargetForPattern}.
3.  **PRESERVAÇÃO MÁXIMA:** TODOS os outros elementos DEVEM permanecer 100% IDÊNTICOS: o rosto, o corpo, a pose, o tom de pele, o fundo, a iluminação e TODAS as outras peças de roupa não mencionadas.
4.  **APLICAÇÃO REALISTA:** A estampa deve adaptar-se realisticamente às dobras, sombras e contornos do tecido original.`;
          contents.parts.push({ text: prompt });
          break;
        case 'clothing-pattern-add-image':
           if (!patternImage) throw new Error("Por favor, carregue uma imagem de referência para a estampa.");
           const patternImageFile = await (await fetch(patternImage)).blob();
           const patternImagePart = await fileToGenerativePart(patternImageFile);
           prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões (largura e altura em pixels) da imagem original. Nenhum corte ou distorção é permitido.
2.  **FOCO DA EDIÇÃO:** Use a imagem de referência fornecida APENAS como uma estampa. Aplique esta estampa APENAS n${clothingTargetForPattern === 'camisa' || clothingTargetForPattern === 'vestido' ? 'a' : 'o'} ${clothingTargetForPattern} da pessoa na imagem original.
3.  **PRESERVAÇÃO MÁXIMA:** TODOS os outros elementos DEVEM permanecer 100% IDÊNTICOS: o rosto, o corpo, a pose, o tom de pele, o fundo, a iluminação e TODAS as outras peças de roupa não mencionadas.
4.  **APLICAÇÃO REALISTA:** A estampa deve adaptar-se realisticamente às dobras, sombras e contornos do tecido original.`;
           contents.parts.push(patternImagePart);
           contents.parts.push({ text: prompt });
           break;

        // ========== FILTER CASES ==========
        case 'skin-smoothing':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões da imagem original.
2.  **FOCO DA EDIÇÃO:** Aplique um retoque FOTORREALISTA e SUTIL na pele da(s) pessoa(s) na imagem. Remova pequenas imperfeições como acne ou manchas. O objetivo é suavizar a pele, mas PRESERVAR A TEXTURA NATURAL. A pele não pode parecer plástica ou artificial.
3.  **PRESERVAÇÃO MÁXIMA:** É PROIBIDO alterar o tom de pele, o formato do rosto, a identidade da pessoa, roupas, fundo ou qualquer outro elemento. Apenas a suavidade da pele é ajustada.`;
          contents.parts.push({ text: prompt });
          break;
        case 'noise-reduction':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões da imagem original.
2.  **FOCO DA EDIÇÃO:** Aplique um algoritmo de redução de ruído digital (denoise) na imagem inteira. Remova o granulado indesejado, especialmente em áreas de sombra.
3.  **PRESERVAÇÃO DE DETALHES:** O processo deve preservar os detalhes finos da imagem. NÃO suavize excessivamente a imagem a ponto de perder nitidez.
4.  **PRESERVAÇÃO MÁXIMA:** É PROIBIDO alterar cores, a identidade da pessoa, o formato do rosto, roupas, fundo ou qualquer outro elemento. Apenas o ruído digital é removido.`;
          contents.parts.push({ text: prompt });
          break;
        case 'sharpen':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões da imagem original.
2.  **FOCO DA EDIÇÃO:** Aplique um ajuste de nitidez (sharpening) SUTIL na imagem inteira para melhorar a definição das bordas e detalhes finos.
3.  **SEM ARTEFACTOS:** NÃO introduza halos, ruído adicional ou outros artefactos visuais. O efeito deve ser natural.
4.  **PRESERVAÇÃO MÁXIMA:** É PROIBIDO alterar cores, a identidade da pessoa, o formato do rosto, roupas, fundo ou qualquer outro elemento. Apenas a nitidez é ajustada.`;
          contents.parts.push({ text: prompt });
          break;
        case 'brightness':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões da imagem original.
2.  **FOCO DA EDIÇÃO:** Aumente o brilho global (exposição) da imagem de forma equilibrada e sutil.
3.  **PRESERVAR ALTAS LUZES:** Evite "estourar" (clipping) as áreas que já são claras. Os detalhes nas altas luzes devem ser preservados.
4.  **PRESERVAÇÃO MÁXIMA:** O contraste e a saturação de cor devem ser maioritariamente preservados. NÃO altere a identidade da pessoa, formato do rosto, etc.`;
          contents.parts.push({ text: prompt });
          break;
        case 'contrast':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões da imagem original.
2.  **FOCO DA EDIÇÃO:** Aumente o contraste da imagem de forma sutil. Torne os pretos um pouco mais profundos e os brancos um pouco mais brilhantes para aumentar a vibração geral.
3.  **PRESERVAR DETALHES:** Não perca detalhes nas sombras ou nas altas luzes.
4.  **PRESERVAÇÃO MÁXIMA:** NÃO sature excessivamente as cores nem altere a identidade da pessoa, formato do rosto, etc.`;
          contents.parts.push({ text: prompt });
          break;
        case 'auto-enhance':
          prompt = `INSTRUÇÃO CRÍTICA E TÉCNICA. SIGA TODAS AS REGRAS RIGOROSAMENTE.
1.  **PROIBIDO CORTAR/DISTORCER:** A imagem final deve ter EXATAMENTE as mesmas dimensões da imagem original.
2.  **FOCO DA EDIÇÃO:** Realize uma melhoria automática e fotorrealista na imagem. Analise a foto e aplique um conjunto equilibrado de ajustes (brilho, contraste, balanço de branco, saturação) para melhorar a qualidade geral.
3.  **RESULTADO NATURAL:** A melhoria deve ser natural e agradável, como se a foto tivesse sido tirada em melhores condições. NÃO aplique filtros estilísticos ou dramáticos.
4.  **PRESERVAÇÃO MÁXIMA:** A identidade da pessoa, o conteúdo da cena e todos os elementos devem ser 100% preservados. Apenas a qualidade fotográfica é melhorada.`;
          contents.parts.push({ text: prompt });
          break;

        default:
          throw new Error("Por favor, selecione uma ferramenta válida.");
      }
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: contents,
        config: { responseModalities: [Modality.IMAGE] },
      });

      const parts = response?.candidates?.[0]?.content?.parts;
      if (parts) {
        const imagePart = parts.find(part => part.inlineData);
        if (imagePart) {
          const base64ImageBytes = imagePart.inlineData.data;
          const imageUrl = `data:image/png;base64,${base64ImageBytes}`;
          setEditedImage(imageUrl);
        } else {
          throw new Error("A edição foi bem-sucedida, mas o modelo não retornou uma imagem.");
        }
      } else {
        throw new Error('O modelo não retornou nenhum conteúdo. O prompt pode ter sido bloqueado.');
      }

    } catch (err) {
      console.error(err);
      const typedError = err as Error;

      let title = 'Ocorreu um Erro';
      let message = typedError.message || 'Falha ao aplicar a edição. Por favor, verifique a sua ligação e tente novamente.';

      if (message.includes("imagem de referência para a troca de roupa")) {
        title = 'Falta Imagem de Referência';
      } else if (message.includes("imagem de referência para a estampa")) {
        title = 'Falta Imagem de Estampa';
      } else if (message.includes("ferramenta válida")) {
        title = 'Nenhuma Ferramenta Selecionada';
      } else if (message.includes("modelo não retornou uma imagem")) {
        title = 'Resposta Incompleta';
      } else if (message.includes("bloqueado")) {
        title = 'Pedido Bloqueado';
        message = 'O seu pedido foi bloqueado por motivos de segurança. Por favor, ajuste a imagem ou o texto e tente novamente.';
      }
      
      setError({ title, message });
    } finally {
      setLoadingTool('');
    }
  };

  const handleAccordionToggle = (accordion) => {
    setActiveAccordion(activeAccordion === accordion ? '' : accordion);
    setActiveTool('');
  };

  const handleToolSelect = (tool) => {
    setActiveTool(tool);
  };
  
  const handleDownload = () => {
    if (!editedImage) return;
    const link = document.createElement('a');
    link.href = editedImage;
    link.download = 'imagem-editada.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    setEditedImage(null);
    setError(null);
    resetView();
  };
  
  // Pan and Zoom handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const newScale = scale - e.deltaY * 0.005;
    setScale(Math.max(0.5, Math.min(newScale, 5))); 
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return; 
    e.preventDefault();
    setIsPanning(true);
    startPanPositionRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - startPanPositionRef.current.x,
        y: e.clientY - startPanPositionRef.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning]);


  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <h1 style={styles.title}>Editor Visual com IA</h1>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>1. Carregar Imagem</h2>
          <button style={styles.uploadButton} onClick={() => originalImageInputRef.current?.click()}>
            Selecionar Foto Principal
          </button>
          <input type="file" accept="image/*" ref={originalImageInputRef} onChange={handleImageUpload(setOriginalImage)} style={{ display: 'none' }} />
        </section>

        {originalImage && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>2. Escolha a Ferramenta</h2>
            
            <AccordionItem title="Cabelo" accordionKey="hair" activeAccordion={activeAccordion} onToggle={handleAccordionToggle}>
              <ToolOption tool="hair-color" label="Cor do Cabelo" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit}>
                <input type="color" value={hairColor} onChange={(e) => setHairColor(e.target.value)} style={styles.colorInput} />
              </ToolOption>
              <ToolOption tool="hair-style" label="Estilo do Cabelo" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit}>
                <textarea 
                  value={hairStyle} 
                  onChange={(e) => setHairStyle(e.target.value)} 
                  style={styles.textInput} 
                  placeholder="ex: cabelo longo, cacheado e com tranças"
                  rows={3}
                />
              </ToolOption>
            </AccordionItem>
            
            <AccordionItem title="Olhos" accordionKey="eyes" activeAccordion={activeAccordion} onToggle={handleAccordionToggle}>
               <ToolOption tool="eye-color" label="Cor dos Olhos" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit}>
                <input type="color" value={eyeColor} onChange={(e) => setEyeColor(e.target.value)} style={styles.colorInput} />
              </ToolOption>
              <ToolOption tool="eye-shape" label="Formato dos Olhos" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit}>
                <input type="text" value={eyeShape} onChange={(e) => setEyeShape(e.target.value)} style={styles.textInput} placeholder="ex: amendoados" />
              </ToolOption>
            </AccordionItem>

            <AccordionItem title="Roupas" accordionKey="clothing" activeAccordion={activeAccordion} onToggle={handleAccordionToggle}>
                <ToolOption tool="clothing-color" label="Cor da Roupa" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit}>
                    <input type="text" value={clothingTargetForColor} onChange={(e) => setClothingTargetForColor(e.target.value)} style={styles.textInput} placeholder="Peça de roupa" />
                    <input type="color" value={clothingColor} onChange={(e) => setClothingColor(e.target.value)} style={styles.colorInput} />
                </ToolOption>
                <ToolOption tool="clothing-swap" label="Trocar Roupa" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit}>
                    <input type="text" value={clothingTargetForSwap} onChange={(e) => setClothingTargetForSwap(e.target.value)} style={styles.textInput} placeholder="Peça a substituir" />
                    <button style={styles.miniUploadButton} onClick={(e) => { e.stopPropagation(); referenceImageInputRef.current?.click(); }}>
                        Carregar Referência
                    </button>
                    <input type="file" accept="image/*" ref={referenceImageInputRef} onChange={handleImageUpload(setClothingReferenceImage)} style={{ display: 'none' }} />
                    {clothingReferenceImage && <img src={clothingReferenceImage} style={styles.thumbnail} alt="Referência"/>}
                </ToolOption>
                <ToolOption tool="clothing-pattern-remove" label="Remover Estampa" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit}>
                   <input type="text" value={removePatternTarget} onChange={(e) => setRemovePatternTarget(e.target.value)} style={styles.textInput} placeholder="Peça de roupa" />
                </ToolOption>
                <ToolOption tool="clothing-pattern-add-prompt" label="Adicionar Estampa (Texto)" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit}>
                    <input type="text" value={clothingTargetForPattern} onChange={(e) => setClothingTargetForPattern(e.target.value)} style={styles.textInput} placeholder="Peça de roupa" />
                    <input type="text" value={patternPrompt} onChange={(e) => setPatternPrompt(e.target.value)} style={styles.textInput} placeholder="Descreva a estampa" />
                </ToolOption>
                 <ToolOption tool="clothing-pattern-add-image" label="Adicionar Estampa (Imagem)" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit}>
                     <input type="text" value={clothingTargetForPattern} onChange={(e) => setClothingTargetForPattern(e.target.value)} style={styles.textInput} placeholder="Peça de roupa" />
                    <button style={styles.miniUploadButton} onClick={(e) => { e.stopPropagation(); patternImageInputRef.current?.click(); }}>
                        Carregar Estampa
                    </button>
                    <input type="file" accept="image/*" ref={patternImageInputRef} onChange={handleImageUpload(setPatternImage)} style={{ display: 'none' }} />
                    {patternImage && <img src={patternImage} style={styles.thumbnail} alt="Estampa"/>}
                </ToolOption>
            </AccordionItem>
            
             <AccordionItem title="Filtros e Melhorias" accordionKey="filters" activeAccordion={activeAccordion} onToggle={handleAccordionToggle}>
                <ToolOption tool="skin-smoothing" label="Limpeza de Pele" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit} />
                <ToolOption tool="noise-reduction" label="Redução de Ruído" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit} />
                <ToolOption tool="sharpen" label="Melhorar Nitidez" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit} />
                <ToolOption tool="brightness" label="Aumentar Brilho" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit} />
                <ToolOption tool="contrast" label="Aumentar Contraste" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit} />
                <ToolOption tool="auto-enhance" label="Melhoria Automática" activeTool={activeTool} loadingTool={loadingTool} onSelect={handleToolSelect} onApply={applyEdit} />
            </AccordionItem>

          </section>
        )}
        
      </aside>
      <main style={styles.mainContent}>
        {loadingTool && (
          <div style={styles.loaderContainer}>
            <div style={styles.spinner}></div>
            <p>O Gemini está a fazer magia...</p>
          </div>
        )}
        {error && (
            <div style={styles.error} role="alert">
                <div style={styles.errorHeader}>
                    <h4 style={styles.errorTitle}>{error.title}</h4>
                    <button style={styles.errorCloseButton} onClick={() => setError(null)}>
                        &times;
                    </button>
                </div>
                <p style={styles.errorMessage}>{error.message}</p>
            </div>
        )}

        <div style={styles.imageContainer}>
          <div style={styles.imageWrapper} onWheel={handleWheel}>
            {originalImage ? (
              <>
                <h3 
                  style={{...styles.peekLabel, ...(editedImage && { cursor: 'pointer' })}}
                  onMouseDown={() => editedImage && setIsPeekingOriginal(true)}
                  onMouseUp={() => editedImage && setIsPeekingOriginal(false)}
                  onMouseLeave={() => editedImage && setIsPeekingOriginal(false)}
                  onTouchStart={() => editedImage && setIsPeekingOriginal(true)}
                  onTouchEnd={() => editedImage && setIsPeekingOriginal(false)}
                  title={editedImage ? "Segure para ver a imagem original" : undefined}
                >
                  {isPeekingOriginal ? 'Original' : (editedImage ? 'Editada' : 'Original')}
                </h3>
                <img 
                    src={isPeekingOriginal ? originalImage : (editedImage || originalImage)} 
                    alt={isPeekingOriginal ? 'Original' : (editedImage ? 'Editada' : 'Original')} 
                    style={{
                      ...styles.image, 
                      transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                      cursor: scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default'
                    }}
                    onMouseDown={handleMouseDown}
                />
                {originalImage && (
                    <div style={styles.zoomControls}>
                        <button style={styles.zoomButton} onClick={() => setScale(s => Math.min(s + 0.2, 5))}>+</button>
                        <button style={styles.zoomButton} onClick={() => setScale(s => Math.max(s - 0.2, 0.5))}>-</button>
                        <button style={styles.zoomButton} onClick={resetView}>&#x21BB;</button>
                    </div>
                )}
                {editedImage && (
                  <div style={styles.imageActions}>
                    <button style={styles.actionButton} onClick={handleDownload}>
                      Baixar Imagem
                    </button>
                    <button style={{...styles.actionButton, ...styles.resetButton}} onClick={handleReset}>
                      Restaurar Original
                    </button>
                  </div>
                )}
              </>
            ) : (
                <div style={styles.imagePlaceholder}>Carregue uma imagem para começar</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};


const styles: { [key: string]: CSSProperties } = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#1a202c', color: '#e2e8f0' },
  sidebar: { width: '380px', backgroundColor: '#2d3748', padding: '20px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #4a5568', overflowY: 'auto' },
  title: { fontSize: '24px', margin: '0 0 20px 0', textAlign: 'center' },
  section: { marginBottom: '20px', borderBottom: '1px solid #4a5568', paddingBottom: '20px' },
  sectionTitle: { fontSize: '18px', marginBottom: '15px', color: '#a0aec0' },
  uploadButton: { width: '100%', padding: '12px', backgroundColor: '#4a5568', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', fontSize: '16px' },
  miniUploadButton: { width: '100%', padding: '8px', backgroundColor: '#4a5568', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '12px', marginTop: '5px' },
  
  accordionItem: { marginBottom: '10px', border: '1px solid #4a5568', borderRadius: '6px' },
  accordionHeader: { width: '100%', padding: '15px', backgroundColor: '#4a5568', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  accordionContent: { padding: '15px', backgroundColor: 'rgba(0,0,0,0.2)' },
  
  toolCard: { padding: '10px', backgroundColor: '#2d3748', border: '1px solid #4a5568', borderRadius: '6px', cursor: 'pointer', marginBottom: '10px' },
  activeToolCard: { borderColor: '#3182ce', borderWidth: '2px', padding: '9px' },
  toolHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' },
  toolTitle: { margin: 0, fontSize: '14px', color: '#cbd5e0'},
  toolBody: { marginTop: '10px' },
  
  colorInput: { width: '100%', height: '35px', backgroundColor: '#1a202c', border: '1px solid #4a5568', borderRadius: '6px', padding: '5px', marginTop: '5px' },
  textInput: { width: '100%', padding: '8px', backgroundColor: '#1a202c', border: '1px solid #4a5568', borderRadius: '6px', color: 'white', marginTop: '5px', fontFamily: 'inherit', fontSize: 'inherit', resize: 'vertical' },
  thumbnail: { maxWidth: '80px', maxHeight: '80px', objectFit: 'cover', borderRadius: '6px', marginTop: '10px' },
  applyToolButton: { padding: '6px 12px', backgroundColor: '#3182ce', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
  
  mainContent: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '32px', position: 'relative' },
  imageContainer: { display: 'flex', width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  imageWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', maxWidth: '700px', height: '90%', overflow: 'hidden', position: 'relative' },
  image: { width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px', transition: 'transform 0.1s ease-out', willChange: 'transform' },
  imagePlaceholder: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#718096', border: '2px dashed #4a5568', borderRadius: '8px' },
  
  peekLabel: {
    userSelect: 'none',
    color: '#a0aec0',
    textAlign: 'center',
    margin: '0 0 10px 0'
  },
  imageActions: { display: 'flex', gap: '10px', marginTop: '15px' },
  actionButton: { padding: '10px 20px', backgroundColor: '#3182ce', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', fontSize: '14px' },
  resetButton: { backgroundColor: '#c53030' },

  loaderContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  spinner: { border: '4px solid #4a5568', borderTop: '4px solid #63b3ed', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' },
  
  zoomControls: {
    position: 'absolute',
    bottom: '10px',
    right: '10px',
    backgroundColor: 'rgba(45, 55, 72, 0.8)',
    borderRadius: '6px',
    display: 'flex',
    gap: '5px',
    padding: '5px',
    zIndex: 5
  },
  zoomButton: {
    width: '30px',
    height: '30px',
    backgroundColor: '#4a5568',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: 'bold',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    lineHeight: 1
  },

  error: { 
    color: '#fed7d7', 
    backgroundColor: '#4c1d1d', 
    border: '1px solid #c53030',
    padding: '16px', 
    borderRadius: '8px', 
    position: 'absolute', 
    top: '32px', 
    left: '32px', 
    right: '32px', 
    zIndex: 20,
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)' 
  },
  errorHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  errorTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 'bold',
  },
  errorMessage: {
    margin: 0,
    fontSize: '16px',
  },
  errorCloseButton: {
    background: 'transparent',
    border: 'none',
    color: '#fed7d7',
    fontSize: '24px',
    lineHeight: '1',
    cursor: 'pointer',
    padding: '0',
    opacity: 0.7,
  },
};

const css = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.tool-card {
    transition: transform 0.2s ease-in-out, border-color 0.2s ease-in-out;
}
.tool-card:hover {
    transform: translateY(-2px);
    border-color: #63b3ed;
}
.apply-tool-button {
    transition: background-color 0.2s ease-in-out;
}
.apply-tool-button:hover {
    background-color: #4299e1;
}
.error-close-button:hover {
    opacity: 1;
}
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = css;
document.head.appendChild(styleSheet);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);