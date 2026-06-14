import React, { useEffect, useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const API_ORIGIN = API_BASE_URL.replace(/\/$/, "");
const DEFAULT_META_REDIRECT_URI = `${API_ORIGIN}/api/auth/meta/callback`;
const LOGIN_STORAGE_KEY = "instagram-local-publisher-session";

const initialMeta = {
  meta_app_id: "",
  meta_app_secret: "",
  meta_redirect_uri: DEFAULT_META_REDIRECT_URI,
};

const initialTranslation = {
  provider: "none",
  api_key: "",
  base_url: "",
  model: "",
};

const initialWatermark = {
  mode: "none",
  text: "",
  image_path: "",
  position: "bottom-right",
  margin_x: 24,
  margin_y: 24,
  opacity: 0.7,
};

const initialVideoTemplate = {
  enabled: true,
  image_path: "app/assets/templates/mundo-technology-template.png",
  auto_detect_source: true,
  crop_top_ratio: 0.22,
  top_safe_ratio: 0.17,
  bottom_safe_ratio: 0.17,
  side_margin_ratio: 0.03,
  detect_title_text: true,
  title_area_ratio: 0.13,
  title_video_gap_ratio: 0.025,
  title_font_size: 42,
  title_font_family: "sans",
  title_font_weight: "bold",
  title_font_style: "normal",
  title_max_chars_per_line: 34,
  title_font_file: "",
};

const initialOperation = {
  instagram_url: "",
  publish_account_id: "",
};

const navigationItems = [
  { id: "publication", label: "Publicação" },
  { id: "linked-accounts", label: "Contas Vinculadas" },
  { id: "global-settings", label: "Configuração global" },
];

function getStoredSession() {
  try {
    return JSON.parse(window.localStorage.getItem(LOGIN_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function currentTitleText(job) {
  return job?.final_title_text ?? job?.source_title_text ?? "";
}

function App() {
  const [session, setSession] = useState(() => getStoredSession());
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState("publication");
  const [settings, setSettings] = useState({ meta: {}, translation: {}, watermark: {}, video_template: {} });
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(initialMeta);
  const [translation, setTranslation] = useState(initialTranslation);
  const [watermark, setWatermark] = useState(initialWatermark);
  const [videoTemplate, setVideoTemplate] = useState(initialVideoTemplate);
  const [accountTemplates, setAccountTemplates] = useState({});
  const [operation, setOperation] = useState(initialOperation);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const productState = useMemo(() => {
    const configuredAccounts = accounts.filter((account) => account.template_status === "configured").length;
    const readyJobs = jobs.filter((job) => ["ready_to_review", "rendered", "published"].includes(job.status)).length;
    const scheduledJobs = jobs.filter((job) => Boolean(job.scheduled_for)).length;
    return { configuredAccounts, readyJobs, scheduledJobs };
  }, [accounts, jobs]);

  useEffect(() => {
    if (session) {
      loadInitialData();
    }
  }, [session]);

  function buildVideoUrl(job) {
    if (!job?.id || !job?.output_video_path) return "";

    const version = encodeURIComponent(job.updated_at || job.output_video_path);
    const token = encodeURIComponent(session?.accessToken || "");
    return `${API_BASE_URL}/api/jobs/${job.id}/download?v=${version}&access_token=${token}`;
  }

  function buildSourceVideoUrl(job) {
    if (!job?.id || !job?.input_video_path) return "";

    const version = encodeURIComponent(job.updated_at || job.input_video_path);
    const token = encodeURIComponent(session?.accessToken || "");
    return `${API_BASE_URL}/api/jobs/${job.id}/source?v=${version}&access_token=${token}`;
  }

  async function fetchJson(path, options) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "Falha ao comunicar com a API.");
    }
    return data;
  }

  async function loadInitialData() {
    try {
      const [settingsResponse, accountsResponse, jobsResponse] = await Promise.all([
        fetchJson("/api/settings"),
        fetchJson("/api/accounts"),
        fetchJson("/api/jobs"),
      ]);
      setSettings(settingsResponse);
      setAccounts(accountsResponse);
      setSelectedAccountId((current) => {
        if (current && accountsResponse.some((account) => account.id === current)) return current;
        return accountsResponse[0]?.id || "";
      });
      setJobs(jobsResponse);
      setMeta((current) => ({ ...current, ...settingsResponse.meta }));
      setTranslation((current) => ({ ...current, ...settingsResponse.translation }));
      setWatermark((current) => ({ ...current, ...settingsResponse.watermark }));
      setVideoTemplate((current) => ({ ...current, ...settingsResponse.video_template }));
      setAccountTemplates(
        Object.fromEntries(
          accountsResponse.map((account) => [
            account.id,
            {
              display_name: account.display_name || account.account_name || "",
              template_spacing_mm: account.template_spacing_mm ?? 4,
              header: null,
              footer: null,
            },
          ])
        )
      );
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoginError("");

    if (!loginForm.email.trim() || loginForm.password.length < 6) {
      setLoginError("Informe um e-mail e uma senha local com pelo menos 6 caracteres.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Falha no login.");
      }
      const nextSession = {
        email: data.user.email,
        accessToken: data.access_token,
        expiresAt: data.expires_at,
      };
      window.localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setLoginForm({ email: "", password: "" });
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function submitRegister(event) {
    event.preventDefault();
    setLoginError("");

    if (!loginForm.email.trim() || loginForm.password.length < 6) {
      setLoginError("Informe um e-mail e uma senha com pelo menos 6 caracteres.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Falha no cadastro.");
      }
      setLoginError(data.message || "Cadastro criado. Voce ja pode entrar.");
      setIsRegistering(false);
      setLoginForm({ email: loginForm.email, password: "" });
    } catch (error) {
      setLoginError(error.message);
    }
  }

  function logout() {
    window.localStorage.removeItem(LOGIN_STORAGE_KEY);
    setSession(null);
    setResult(null);
    setMessage("");
  }

  async function saveMeta(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await fetchJson("/api/settings/meta", {
        method: "POST",
        body: JSON.stringify(meta),
      });
      await loadInitialData();
      setMessage("Configuração Meta salva.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveTranslation(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await fetchJson("/api/settings/translation", {
        method: "POST",
        body: JSON.stringify(translation),
      });
      await loadInitialData();
      setMessage("Configuração de tradução salva.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveWatermark(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await fetchJson("/api/settings/watermark", {
        method: "POST",
        body: JSON.stringify({
          ...watermark,
          margin_x: Number(watermark.margin_x),
          margin_y: Number(watermark.margin_y),
          opacity: Number(watermark.opacity),
        }),
      });
      await loadInitialData();
      setMessage("Configuração de marca d'água salva.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveVideoTemplate(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await fetchJson("/api/settings/video-template", {
        method: "POST",
        body: JSON.stringify({
          ...videoTemplate,
          crop_top_ratio: Number(videoTemplate.crop_top_ratio),
          top_safe_ratio: Number(videoTemplate.top_safe_ratio),
          bottom_safe_ratio: Number(videoTemplate.bottom_safe_ratio),
          side_margin_ratio: Number(videoTemplate.side_margin_ratio),
          title_area_ratio: Number(videoTemplate.title_area_ratio),
          title_video_gap_ratio: Number(videoTemplate.title_video_gap_ratio),
          title_font_size: Number(videoTemplate.title_font_size),
          title_font_family: videoTemplate.title_font_family || "sans",
          title_font_weight: videoTemplate.title_font_weight || "bold",
          title_font_style: videoTemplate.title_font_style || "normal",
          title_max_chars_per_line: Number(videoTemplate.title_max_chars_per_line),
          title_font_file: videoTemplate.title_font_file || null,
        }),
      });
      await loadInitialData();
      setMessage("Template padrão salvo.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveAccountTemplate(accountId, event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await saveAccountTemplateSettings(accountId);
      await loadInitialData();
      setMessage("Conta atualizada.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveAccountTemplateSettings(accountId) {
    const accountTemplate = accountTemplates[accountId] || {};
    return fetchJson(`/api/accounts/${accountId}`, {
      method: "PATCH",
      body: JSON.stringify({
        display_name: accountTemplate.display_name,
        template_spacing_mm: Number(accountTemplate.template_spacing_mm),
      }),
    });
  }

  async function uploadAccountTemplate(accountId, event) {
    event.preventDefault();
    const form = event.currentTarget;
    const accountTemplate = accountTemplates[accountId] || {};
    const account = accounts.find((item) => item.id === accountId);
    const headerFile = accountTemplate.header || form.elements.header?.files?.[0] || null;
    const footerFile = accountTemplate.footer || form.elements.footer?.files?.[0] || null;
    const hasHeader = Boolean(account?.header_image_url);
    const hasFooter = Boolean(account?.footer_image_url);
    if (!headerFile && !footerFile) {
      setMessage("Selecione pelo menos uma imagem para enviar.");
      return;
    }
    if (!headerFile && !hasHeader) {
      setMessage("Selecione o header antes de enviar.");
      return;
    }
    if (!footerFile && !hasFooter) {
      setMessage("Selecione o footer antes de enviar.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const formData = new FormData();
      if (headerFile) formData.append("header", headerFile);
      if (footerFile) formData.append("footer", footerFile);
      formData.append("display_name", accountTemplate.display_name || "");
      formData.append("template_spacing_mm", String(Number(accountTemplate.template_spacing_mm ?? 4)));
      const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}/template-images`, {
        method: "POST",
        headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {},
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Falha ao salvar imagens da conta.");
      }
      await loadInitialData();
      setMessage("Imagens da conta salvas.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function connectInstagram() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetchJson("/api/auth/meta/start");
      window.open(response.auth_url, "_blank", "noopener,noreferrer");
      setMessage("Fluxo OAuth aberto em nova aba.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitOperation(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setResult(null);

    const payload = {
      instagram_url: operation.instagram_url,
      publish_account_id: operation.publish_account_id,
      watermark_profile: "default",
    };

    try {
      const response = await fetchJson("/api/jobs/prepare-for-review", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResult(response);
      await loadInitialData();
      if (response.scheduler_auto_registered === false) {
        setMessage(
          "Job salvo. Como o backend está rodando sem registro automático, execute o comando retornado em um PowerShell do host."
        );
      } else {
        setMessage("Vídeo pronto para revisão.");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function publishPreparedJob() {
    if (!result?.id) return;

    setLoading(true);
    setMessage("");
    try {
      const response = await fetchJson(`/api/jobs/${result.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ final_caption: result.final_caption || "" }),
      });
      setResult(response);
      await loadInitialData();
      setMessage("Vídeo publicado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function renderPreparedJob() {
    if (!result?.id) return;

    setLoading(true);
    setMessage("");
    try {
      if (result.publish_account_id) {
        await saveAccountTemplateSettings(result.publish_account_id);
      }
      const response = await fetchJson(`/api/jobs/${result.id}/render`, {
        method: "POST",
        body: JSON.stringify({ final_title_text: currentTitleText(result) }),
      });
      setResult(response);
      await loadInitialData();
      setMessage("Vídeo atualizado com o título revisado.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function exportSettingsFile() {
    const publicSettings = {
      meta: settings.meta,
      translation: settings.translation,
      watermark,
      video_template: videoTemplate,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(publicSettings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "instagram-local-publisher-settings.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importSettingsFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage("");
    try {
      const payload = JSON.parse(await file.text());
      if (payload.meta) {
        await fetchJson("/api/settings/meta", {
          method: "POST",
          body: JSON.stringify({ ...initialMeta, ...payload.meta, meta_app_secret: meta.meta_app_secret }),
        });
      }
      if (payload.translation) {
        await fetchJson("/api/settings/translation", {
          method: "POST",
          body: JSON.stringify({ ...initialTranslation, ...payload.translation, api_key: translation.api_key }),
        });
      }
      if (payload.watermark) {
        await fetchJson("/api/settings/watermark", {
          method: "POST",
          body: JSON.stringify(payload.watermark),
        });
      }
      if (payload.video_template) {
        await fetchJson("/api/settings/video-template", {
          method: "POST",
          body: JSON.stringify(payload.video_template),
        });
      }
      await loadInitialData();
      setMessage("Arquivo de configuração importado.");
    } catch (error) {
      setMessage(error.message || "Arquivo de configuração inválido.");
    } finally {
      event.target.value = "";
      setLoading(false);
    }
  }

  function renderResult() {
    if (!result) return null;

    const sourceVideoUrl = buildSourceVideoUrl(result);
    const editedVideoUrl = buildVideoUrl(result);

    return (
      <div className="result-card">
        <div className="result-header">
          <div>
            <p className="eyebrow">Bancada</p>
            <h3>Bancada de edição</h3>
          </div>
          <div className="result-meta">
            <span>{result.id}</span>
            <strong>{result.status}</strong>
          </div>
        </div>
        <div className="video-compare-grid">
          <div className="video-frame">
            <div className="video-frame-header">
              <strong>Original</strong>
              <span>{sourceVideoUrl ? "carregado" : "aguardando"}</span>
            </div>
            {sourceVideoUrl ? (
              <video key={sourceVideoUrl} className="video-preview" src={sourceVideoUrl} controls />
            ) : (
              <div className="empty-preview">O vídeo original aparece aqui depois do carregamento.</div>
            )}
          </div>
          <div className="video-frame">
            <div className="video-frame-header">
              <strong>Editado</strong>
              <span>{editedVideoUrl ? result.status : "aguardando"}</span>
            </div>
            {editedVideoUrl ? (
              <video key={editedVideoUrl} className="video-preview" src={editedVideoUrl} controls />
            ) : (
              <div className="empty-preview">A versão editada aparece aqui após aplicar edição.</div>
            )}
          </div>
        </div>
        <div className="compare-note">Compare o vídeo original com o editado antes de postar.</div>
        {result.scheduler_command ? (
          <div className="schedule-result">
            <h4>Agendamento no Windows</h4>
            {result.scheduler_message ? <p>{result.scheduler_message}</p> : null}
            <pre>{result.scheduler_command}</pre>
          </div>
        ) : null}
      </div>
    );
  }

  function renderOperationPage() {
    const selectedAccount = accounts.find((account) => account.id === (result?.publish_account_id || operation.publish_account_id));
    const selectedTemplate = result?.publish_account_id ? accountTemplates[result.publish_account_id] || {} : {};
    const editedVideoUrl = result ? buildVideoUrl(result) : "";
    const titleText = result ? currentTitleText(result) : "";
    const checklistItems = [
      { label: "Vídeo carregado", done: Boolean(result?.input_video_path) },
      { label: "Conta selecionada", done: Boolean(operation.publish_account_id || result?.publish_account_id) },
      { label: "Título preenchido", done: Boolean(titleText.trim()) },
      { label: "Pronto para postar", done: Boolean(result?.output_video_path) },
    ];

    return (
      <main className="publication-layout">
        <section className="panel publication-details-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Dados</p>
              <h2>Dados da publicação</h2>
            </div>
            <button className="ghost-button compact-button" type="button" onClick={loadInitialData} disabled={loading}>
              Atualizar
            </button>
          </div>
          <form onSubmit={submitOperation} className="form-grid">
            <label className="full-width">
              URL do vídeo
              <input
                type="url"
                value={operation.instagram_url}
                onChange={(event) => setOperation({ ...operation, instagram_url: event.target.value })}
                placeholder="https://www.instagram.com/reel/..."
                disabled={Boolean(result)}
                required
              />
            </label>

            <label className="full-width">
              Conta
              <select
                value={operation.publish_account_id}
                onChange={(event) => setOperation({ ...operation, publish_account_id: event.target.value })}
                disabled={Boolean(result)}
                required
              >
                <option value="">Selecione</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id} disabled={account.template_status !== "configured"}>
                    {account.display_name || account.account_name} ({account.username || account.instagram_user_id})
                    {account.template_status === "configured" ? "" : " - configurar template"}
                  </option>
                ))}
              </select>
            </label>

            {!result ? (
              <button className="primary-button full-width" disabled={loading} type="submit">
                {loading ? "Processando..." : "Carregar e aplicar edição"}
              </button>
            ) : null}
          </form>

          {result?.input_video_path ? (
            <div className="publication-edit-fields">
              <label>
                Texto do título
                <textarea
                  value={titleText}
                  onChange={(event) => setResult({ ...result, final_title_text: event.target.value })}
                  rows={4}
                />
              </label>
              {result.publish_account_id ? (
                <label>
                  Espaçamento do template (mm)
                  <input
                    type="number"
                    min="0"
                    max="80"
                    step="0.5"
                    value={selectedTemplate.template_spacing_mm ?? 4}
                    onChange={(event) =>
                      setAccountTemplates({
                        ...accountTemplates,
                        [result.publish_account_id]: {
                          ...selectedTemplate,
                          template_spacing_mm: event.target.value,
                        },
                      })
                    }
                  />
                </label>
              ) : null}
              {result.source_title_text ? <p className="hint">Texto detectado no original: {result.source_title_text}</p> : null}
            </div>
          ) : null}

          <div className="action-panel">
            <h3>Ações</h3>
            <div className="action-grid">
              {result?.input_video_path ? (
                <button className="secondary-button" type="button" onClick={renderPreparedJob} disabled={loading}>
                  {loading ? "Aplicando..." : "Aplicar ajustes novamente"}
                </button>
              ) : null}
              {result?.status === "ready_to_review" || result?.output_video_path ? (
                <button className="primary-button publish-button" type="button" onClick={publishPreparedJob} disabled={loading}>
                  {loading ? "Publicando..." : "Postar vídeo"}
                </button>
              ) : null}
              {editedVideoUrl ? (
                <a className="success-link-button" href={editedVideoUrl}>
                  Baixar vídeo gerado
                </a>
              ) : null}
              <button className="secondary-link-button" type="button" onClick={() => setActiveTab("linked-accounts")}>
                Editar imagens
              </button>
            </div>
          </div>
        </section>

        <section className="publication-workbench">
          {renderResult() || (
            <div className="result-card empty-workbench">
              <div className="result-header">
                <div>
                  <p className="eyebrow">Bancada</p>
                  <h3>Bancada de edição</h3>
                </div>
              </div>
              <div className="empty-preview">Carregue um vídeo para comparar o original com a versão editada.</div>
            </div>
          )}
        </section>

        <aside className="publication-sidebar">
          <section className="panel compact-panel">
            <h3>Contas conectadas</h3>
            {selectedAccount ? (
              <div className="connected-account-card">
                <div className="account-avatar">{(selectedAccount.display_name || selectedAccount.account_name || "I").slice(0, 1)}</div>
                <div>
                  <strong>{selectedAccount.display_name || selectedAccount.account_name}</strong>
                  <span>{selectedAccount.username || selectedAccount.instagram_user_id}</span>
                </div>
              </div>
            ) : (
              <p className="hint">Nenhuma conta selecionada.</p>
            )}
            <button className="ghost-button full-width" type="button" onClick={() => setActiveTab("linked-accounts")}>
              Gerenciar contas
            </button>
          </section>
          <section className="panel compact-panel">
            <h3>Checklist rápido</h3>
            <div className="checklist">
              {checklistItems.map((item) => (
                <span key={item.label} className={item.done ? "done" : ""}>
                  {item.label}
                </span>
              ))}
            </div>
          </section>
          <section className="ready-card">
            <h3>Pronto para publicar?</h3>
            <p>Revise tudo e clique em Postar vídeo para enviar ao Instagram.</p>
          </section>
        </aside>
      </main>
    );
  }

  function renderLinkedAccountsPage() {
    const selectedAccount = accounts.find((account) => account.id === selectedAccountId) || accounts[0];
    const selectedTemplate = selectedAccount ? accountTemplates[selectedAccount.id] || {} : {};

    return (
      <main className="linked-accounts-layout">
        <section className="panel linked-accounts-list-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Contas</p>
              <h2>Contas</h2>
              <span>Selecione uma conta para visualizar e editar.</span>
            </div>
            <button className="secondary-button compact-button add-account-button" type="button" onClick={connectInstagram} disabled={loading}>
              Adicionar nova
            </button>
          </div>
          <div className="account-search-row">
            <input placeholder="Buscar conta..." readOnly />
            <button className="ghost-button compact-button" type="button" aria-label="Filtros">
              Filtros
            </button>
          </div>
          <div className="linked-account-list">
            {accounts.map((account) => (
              <button
                key={account.id}
                className={selectedAccount?.id === account.id ? "account-row active" : "account-row"}
                type="button"
                onClick={() => setSelectedAccountId(account.id)}
              >
                <span className="account-row-avatar">
                  {(account.display_name || account.account_name || "I").slice(0, 1)}
                </span>
                <span>
                  <strong>{account.display_name || account.account_name}</strong>
                  <small>{account.username || account.instagram_user_id}</small>
                </span>
                <span className={account.template_status === "configured" ? "pill success" : "pill warning"}>
                  {account.template_status === "configured" ? "configurado" : "pendente"}
                </span>
              </button>
            ))}
            {!accounts.length ? <p>Conecte uma conta Instagram antes de configurar templates.</p> : null}
          </div>
        </section>

        <section className="panel linked-account-detail-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Conta selecionada</p>
              <h2>{selectedAccount ? selectedAccount.display_name || selectedAccount.account_name : "Selecione uma conta"}</h2>
              {selectedAccount ? <span>{selectedAccount.username || selectedAccount.instagram_user_id}</span> : null}
            </div>
            {selectedAccount ? (
              <span className={selectedAccount.template_status === "configured" ? "pill success" : "pill warning"}>
                {selectedAccount.template_status === "configured" ? "conectado" : "pendente"}
              </span>
            ) : null}
          </div>
          {selectedAccount ? (
            <form
              key={selectedAccount.id}
              className="account-template-detail"
              onSubmit={(event) => uploadAccountTemplate(selectedAccount.id, event)}
            >
              <div className="template-preview-row">
                <figure>
                  <figcaption>Header</figcaption>
                  {selectedAccount.header_image_url ? <img src={selectedAccount.header_image_url} alt="Header carregado" /> : <div />}
                </figure>
                <figure>
                  <figcaption>Footer</figcaption>
                  {selectedAccount.footer_image_url ? <img src={selectedAccount.footer_image_url} alt="Footer carregado" /> : <div />}
                </figure>
              </div>
              <div className="form-grid">
                <label>
                  Nome para reconhecimento
                  <input
                    value={selectedTemplate.display_name || ""}
                    onChange={(event) =>
                      setAccountTemplates({
                        ...accountTemplates,
                        [selectedAccount.id]: { ...selectedTemplate, display_name: event.target.value },
                      })
                    }
                    required
                  />
                </label>
                <label>
                  Espaçamento entre elementos (mm)
                  <input
                    type="number"
                    min="0"
                    max="80"
                    step="0.5"
                    value={selectedTemplate.template_spacing_mm ?? 4}
                    onChange={(event) =>
                      setAccountTemplates({
                        ...accountTemplates,
                        [selectedAccount.id]: { ...selectedTemplate, template_spacing_mm: event.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  Header
                  <input
                    name="header"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) =>
                      setAccountTemplates((current) => ({
                        ...current,
                        [selectedAccount.id]: {
                          ...(current[selectedAccount.id] || selectedTemplate),
                          header: event.target.files?.[0] || null,
                        },
                      }))
                    }
                    required={!selectedAccount.header_image_url}
                  />
                </label>
                <label>
                  Footer
                  <input
                    name="footer"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) =>
                      setAccountTemplates((current) => ({
                        ...current,
                        [selectedAccount.id]: {
                          ...(current[selectedAccount.id] || selectedTemplate),
                          footer: event.target.files?.[0] || null,
                        },
                      }))
                    }
                    required={!selectedAccount.footer_image_url}
                  />
                </label>
              </div>
              <div className="account-info-note">
                O header e o footer serão aplicados aos templates desta conta ao gerar as publicações.
              </div>
              <div className="review-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={(event) => saveAccountTemplate(selectedAccount.id, event)}
                  disabled={loading}
                >
                  Salvar alterações
                </button>
                <button className="primary-button" type="submit" disabled={loading}>
                  Enviar header/footer
                </button>
              </div>
            </form>
          ) : (
            <p>Nenhuma conta vinculada ainda.</p>
          )}
        </section>
      </main>
    );
  }

  function renderVideoTemplateSettings() {
    return (
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Template base</p>
            <h2>Recorte e título</h2>
          </div>
        </div>
          <form onSubmit={saveVideoTemplate} className="form-grid">
            <label className="inline-field">
              <input
                type="checkbox"
                checked={Boolean(videoTemplate.enabled)}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, enabled: event.target.checked })}
              />
              Ativar template padrão
            </label>
            <label className="full-width">
              Caminho da imagem base
              <input
                value={videoTemplate.image_path || ""}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, image_path: event.target.value })}
              />
            </label>
            <label className="inline-field">
              <input
                type="checkbox"
                checked={Boolean(videoTemplate.auto_detect_source)}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, auto_detect_source: event.target.checked })}
              />
              Detectar área útil automaticamente
            </label>
            <label className="inline-field">
              <input
                type="checkbox"
                checked={Boolean(videoTemplate.detect_title_text)}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, detect_title_text: event.target.checked })}
              />
              Detectar título no vídeo
            </label>
            <label>
              Recorte superior
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={videoTemplate.crop_top_ratio}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, crop_top_ratio: event.target.value })}
              />
            </label>
            <label>
              Margem lateral
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={videoTemplate.side_margin_ratio}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, side_margin_ratio: event.target.value })}
              />
            </label>
            <label>
              Área do título
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={videoTemplate.title_area_ratio}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, title_area_ratio: event.target.value })}
              />
            </label>
            <label>
              Tamanho do título
              <input
                type="number"
                min="12"
                max="96"
                value={videoTemplate.title_font_size}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, title_font_size: event.target.value })}
              />
            </label>
            <label>
              Largura do texto
              <input
                type="number"
                min="18"
                max="48"
                value={videoTemplate.title_max_chars_per_line || 34}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, title_max_chars_per_line: event.target.value })}
              />
            </label>
            <label>
              Família da fonte
              <select
                value={videoTemplate.title_font_family || "sans"}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, title_font_family: event.target.value })}
              >
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
                <option value="mono">Monoespaçada</option>
              </select>
            </label>
            <label>
              Peso
              <select
                value={videoTemplate.title_font_weight || "regular"}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, title_font_weight: event.target.value })}
              >
                <option value="regular">Regular</option>
                <option value="bold">Negrito</option>
              </select>
            </label>
            <label>
              Estilo
              <select
                value={videoTemplate.title_font_style || "normal"}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, title_font_style: event.target.value })}
              >
                <option value="normal">Normal</option>
                <option value="italic">Itálico</option>
              </select>
            </label>
            <label className="full-width">
              Arquivo de fonte personalizado
              <input
                value={videoTemplate.title_font_file || ""}
                onChange={(event) => setVideoTemplate({ ...videoTemplate, title_font_file: event.target.value })}
                placeholder="Opcional: caminho .ttf/.otf no ambiente do backend"
              />
            </label>
            <button className="secondary-button" type="submit" disabled={loading}>
              Salvar template padrão
            </button>
          </form>
      </section>
    );
  }

  function renderSettingsPage() {
    return (
      <main className="settings-grid">
        <section className="panel">
          <h2>Meta / Instagram</h2>
          <form onSubmit={saveMeta} className="form-grid">
            <label>
              ID do app do Instagram
              <input
                value={meta.meta_app_id}
                onChange={(event) => setMeta({ ...meta, meta_app_id: event.target.value })}
                required
              />
            </label>
            <label>
              Chave secreta do app do Instagram
              <input
                type="password"
                value={meta.meta_app_secret}
                onChange={(event) => setMeta({ ...meta, meta_app_secret: event.target.value })}
                required
              />
            </label>
            <label className="full-width">
              Redirect URI
              <input
                type="url"
                value={meta.meta_redirect_uri}
                onChange={(event) => setMeta({ ...meta, meta_redirect_uri: event.target.value })}
                required
              />
            </label>
            <button className="secondary-button" type="submit" disabled={loading}>
              Salvar Meta
            </button>
            <button className="ghost-button" type="button" onClick={connectInstagram} disabled={loading}>
              Conectar Instagram
            </button>
          </form>
          <div className="hint">Secret configurado: {settings.meta.meta_app_secret_configured ? "sim" : "não"}</div>
        </section>

        <section className="panel">
          <h2>Tradução</h2>
          <form onSubmit={saveTranslation} className="form-grid">
            <label>
              Provider
              <select
                value={translation.provider}
                onChange={(event) => setTranslation({ ...translation, provider: event.target.value })}
              >
                <option value="none">Sem tradução automática</option>
                <option value="openai">OpenAI</option>
                <option value="libretranslate">LibreTranslate</option>
              </select>
            </label>
            <label>
              API Key
              <input
                type="password"
                value={translation.api_key}
                onChange={(event) => setTranslation({ ...translation, api_key: event.target.value })}
              />
            </label>
            <label>
              Base URL
              <input
                value={translation.base_url}
                onChange={(event) => setTranslation({ ...translation, base_url: event.target.value })}
                placeholder="Opcional"
              />
            </label>
            <label>
              Modelo
              <input
                value={translation.model}
                onChange={(event) => setTranslation({ ...translation, model: event.target.value })}
                placeholder="Opcional"
              />
            </label>
            <button className="secondary-button" type="submit" disabled={loading}>
              Salvar tradução
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Marca d&apos;água</h2>
          <form onSubmit={saveWatermark} className="form-grid">
            <label>
              Modo
              <select value={watermark.mode} onChange={(event) => setWatermark({ ...watermark, mode: event.target.value })}>
                <option value="none">Sem marca d&apos;água</option>
                <option value="text">Texto</option>
                <option value="image">Imagem</option>
              </select>
            </label>
            {watermark.mode === "text" ? (
              <label>
                Texto
                <input value={watermark.text} onChange={(event) => setWatermark({ ...watermark, text: event.target.value })} />
              </label>
            ) : null}
            {watermark.mode === "image" ? (
              <label className="full-width">
                Caminho da imagem
                <input
                  value={watermark.image_path}
                  onChange={(event) => setWatermark({ ...watermark, image_path: event.target.value })}
                  placeholder="Use quando o modo for imagem."
                />
              </label>
            ) : null}
            {watermark.mode !== "none" ? (
              <>
                <label>
                  Posição
                  <select value={watermark.position} onChange={(event) => setWatermark({ ...watermark, position: event.target.value })}>
                    <option value="top-left">Topo esquerdo</option>
                    <option value="top-right">Topo direito</option>
                    <option value="bottom-left">Rodapé esquerdo</option>
                    <option value="bottom-right">Rodapé direito</option>
                  </select>
                </label>
                <label>
                  Margem X
                  <input
                    type="number"
                    value={watermark.margin_x}
                    onChange={(event) => setWatermark({ ...watermark, margin_x: event.target.value })}
                  />
                </label>
                <label>
                  Margem Y
                  <input
                    type="number"
                    value={watermark.margin_y}
                    onChange={(event) => setWatermark({ ...watermark, margin_y: event.target.value })}
                  />
                </label>
                <label>
                  Opacidade
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="1"
                    value={watermark.opacity}
                    onChange={(event) => setWatermark({ ...watermark, opacity: event.target.value })}
                  />
                </label>
              </>
            ) : null}
            <button className="secondary-button" type="submit" disabled={loading}>
              Salvar marca d&apos;água
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Arquivo de configuração</h2>
          <div className="file-actions">
            <button className="secondary-button" type="button" onClick={exportSettingsFile}>
              Exportar JSON
            </button>
            <label className="file-button">
              Importar JSON
              <input type="file" accept="application/json" onChange={importSettingsFile} />
            </label>
          </div>
          <p className="hint">
            O arquivo exportado não inclui segredos mascarados pela API. Mantenha chaves sensíveis preenchidas nesta tela.
          </p>
        </section>

        {renderVideoTemplateSettings()}
      </main>
    );
  }

  function renderHistoryPage() {
    return (
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Operação</p>
            <h2>Histórico de jobs</h2>
          </div>
          <button className="ghost-button compact-button" type="button" onClick={loadInitialData} disabled={loading}>
            Atualizar
          </button>
        </div>
        <div className="jobs-grid">
          {jobs.map((job) => (
            <article key={job.id} className="job-card">
              <div className="job-header">
                <strong>{job.status}</strong>
                <span>{job.id}</span>
              </div>
              <p>{job.instagram_url}</p>
              {job.publish_account_id ? <p>Conta: {job.publish_account_id}</p> : <p>Modo: download local</p>}
              {job.scheduled_for ? <p>Agendado para: {job.scheduled_for}</p> : null}
              {job.error_message ? <p className="error-text">{job.error_message}</p> : null}
              {job.output_video_path ? (
                <a className="action-link" href={buildVideoUrl(job)}>
                  Baixar vídeo
                </a>
              ) : null}
              {job.published_permalink ? (
                <a href={job.published_permalink} target="_blank" rel="noreferrer">
                  Abrir mídia publicada
                </a>
              ) : null}
              {job.scheduler_command ? (
                <details>
                  <summary>Comando de agendamento</summary>
                  <pre>{job.scheduler_command}</pre>
                </details>
              ) : null}
            </article>
          ))}
          {!jobs.length ? <p>Nenhum job registrado ainda.</p> : null}
        </div>
      </section>
    );
  }

  function renderActivePage() {
    if (activeTab === "linked-accounts") return renderLinkedAccountsPage();
    if (activeTab === "global-settings") return renderSettingsPage();
    if (activeTab === "history") return renderHistoryPage();
    return renderOperationPage();
  }

  if (!session) {
    return (
      <main className="login-page">
        <section className="login-panel">
          <p className="eyebrow">Instagram Local Publisher</p>
          <h1>Acesso do operador</h1>
          <form onSubmit={isRegistering ? submitRegister : submitLogin} className="login-form">
            <label>
              E-mail
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Senha local
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
                autoComplete="current-password"
                required
              />
            </label>
            {loginError ? <p className="error-text">{loginError}</p> : null}
            <button className="primary-button" type="submit">
              {isRegistering ? "Cadastrar" : "Entrar"}
            </button>
            <button className="ghost-button" type="button" onClick={() => setIsRegistering(!isRegistering)}>
              {isRegistering ? "Voltar para login" : "Cadastrar operador"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark">IL</span>
          <div>
            <strong>Instagram Local</strong>
            <span>Publisher</span>
          </div>
        </div>
        <nav className="nav-tabs" aria-label="Navegação principal">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              className={activeTab === item.id ? "active" : ""}
              type="button"
              onClick={() => setActiveTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button className="ghost-button logout-button" type="button" onClick={logout}>
          Sair
        </button>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <div>
            <h1>{navigationItems.find((item) => item.id === activeTab)?.label}</h1>
            {activeTab === "publication" ? <p>Revise os detalhes e publique seu vídeo.</p> : null}
          </div>
          <div className="operator-card">
            <span>Contas conectadas</span>
            <strong>{accounts.length}</strong>
            <small>{session.email}</small>
          </div>
        </header>

        {message ? <div className="banner">{message}</div> : null}
        {activeTab === "publication" ? <div className="publication-info">Revise os detalhes e publique seu vídeo.</div> : null}
        {renderActivePage()}
      </div>
    </div>
  );
}

export default App;
