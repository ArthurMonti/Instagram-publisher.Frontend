import React, { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

const initialMeta = {
  meta_app_id: "",
  meta_app_secret: "",
  meta_redirect_uri: "http://localhost:8000/api/auth/meta/callback",
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

const initialOperation = {
  instagram_url: "",
  publish_account_id: "",
  caption_override: "",
  schedule_mode: "now",
  scheduled_for: "",
};

function App() {
  const [settings, setSettings] = useState({ meta: {}, translation: {}, watermark: {} });
  const [accounts, setAccounts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(initialMeta);
  const [translation, setTranslation] = useState(initialTranslation);
  const [watermark, setWatermark] = useState(initialWatermark);
  const [operation, setOperation] = useState(initialOperation);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  async function fetchJson(path, options) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
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
      setJobs(jobsResponse);
      setMeta((current) => ({ ...current, ...settingsResponse.meta }));
      setTranslation((current) => ({ ...current, ...settingsResponse.translation }));
      setWatermark((current) => ({ ...current, ...settingsResponse.watermark }));
    } catch (error) {
      setMessage(error.message);
    }
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

    const isDownloadMode = operation.schedule_mode === "download";
    const payload = {
      instagram_url: operation.instagram_url,
      watermark_profile: "default",
      caption_override: operation.caption_override || null,
    };

    if (!isDownloadMode) {
      payload.publish_account_id = operation.publish_account_id;
    }

    const endpoint = isDownloadMode
      ? "/api/jobs/process-for-download"
      : operation.schedule_mode === "schedule"
        ? "/api/jobs/schedule"
        : "/api/jobs/process-and-publish";

    if (operation.schedule_mode === "schedule") {
      payload.scheduled_for = operation.scheduled_for;
    }

    try {
      const response = await fetchJson(endpoint, {
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
        setMessage(
          isDownloadMode
            ? "Vídeo pronto para download."
            : operation.schedule_mode === "schedule"
              ? "Job agendado."
              : "Job processado."
        );
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Operação local</p>
          <h1>Instagram Local Publisher</h1>
          <p className="hero-copy">
            Importe uma URL do Instagram, gere a versão com marca d&apos;água, traduza a legenda e publique
            no Instagram a partir de um fluxo local.
          </p>
        </div>
        <div className="status-card">
          <span>{accounts.length} conta(s) conectada(s)</span>
          <span>{jobs.length} job(s) registrados</span>
        </div>
      </header>

      {message ? <div className="banner">{message}</div> : null}

      <main className="layout">
        <section className="panel panel-accent">
          <h2>Operação</h2>
          <form onSubmit={submitOperation} className="form-grid">
            <label>
              URL do vídeo
              <input
                type="url"
                value={operation.instagram_url}
                onChange={(event) => setOperation({ ...operation, instagram_url: event.target.value })}
                placeholder="https://www.instagram.com/reel/..."
                required
              />
            </label>

            {operation.schedule_mode !== "download" ? (
              <label>
                Conta de publicação
                <select
                  value={operation.publish_account_id}
                  onChange={(event) => setOperation({ ...operation, publish_account_id: event.target.value })}
                  required
                >
                  <option value="">Selecione</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.account_name} ({account.username || account.instagram_user_id})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="full-width">
              Ajuste manual da legenda
              <textarea
                value={operation.caption_override}
                onChange={(event) => setOperation({ ...operation, caption_override: event.target.value })}
                placeholder="Opcional: sobrescreva a legenda traduzida antes de publicar."
                rows={4}
              />
            </label>

            <div className="inline-choice full-width">
              <label>
                <input
                  type="radio"
                  checked={operation.schedule_mode === "now"}
                  onChange={() => setOperation({ ...operation, schedule_mode: "now" })}
                />
                Publicar agora
              </label>
              <label>
                <input
                  type="radio"
                  checked={operation.schedule_mode === "download"}
                  onChange={() => setOperation({ ...operation, schedule_mode: "download" })}
                />
                Baixar vídeo
              </label>
              <label>
                <input
                  type="radio"
                  checked={operation.schedule_mode === "schedule"}
                  onChange={() => setOperation({ ...operation, schedule_mode: "schedule" })}
                />
                Agendar
              </label>
            </div>

            {operation.schedule_mode === "schedule" ? (
              <label className="full-width">
                Data e hora
                <input
                  type="datetime-local"
                  value={operation.scheduled_for}
                  onChange={(event) => setOperation({ ...operation, scheduled_for: event.target.value })}
                  required
                />
              </label>
            ) : null}

            <button className="primary-button full-width" disabled={loading} type="submit">
              {loading
                ? "Processando..."
                : operation.schedule_mode === "download"
                  ? "Processar para download"
                  : operation.schedule_mode === "schedule"
                    ? "Salvar agendamento"
                    : "Processar e publicar"}
            </button>
          </form>

          {result ? (
            <div className="result-card">
              <h3>Último retorno</h3>
              {result.output_video_path ? (
                <a className="action-link" href={`${API_BASE_URL}/api/jobs/${result.id}/download`}>
                  Baixar vídeo gerado
                </a>
              ) : null}
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h2>Configurações</h2>

          <div className="subpanel">
            <h3>Meta / Instagram</h3>
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
            <div className="hint">
              Secret configurado: {settings.meta.meta_app_secret_configured ? "sim" : "não"}
            </div>
          </div>

          <div className="subpanel">
            <h3>Tradução</h3>
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
          </div>

          <div className="subpanel">
            <h3>Marca d&apos;água</h3>
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
                    <select
                      value={watermark.position}
                      onChange={(event) => setWatermark({ ...watermark, position: event.target.value })}
                    >
                      <option value="top-left">Topo esquerdo</option>
                      <option value="top-right">Topo direito</option>
                      <option value="bottom-left">Rodapé esquerdo</option>
                      <option value="bottom-right">Rodapé direito</option>
                    </select>
                  </label>
                  <label>
                    Margem X
                    <input type="number" value={watermark.margin_x} onChange={(event) => setWatermark({ ...watermark, margin_x: event.target.value })} />
                  </label>
                  <label>
                    Margem Y
                    <input type="number" value={watermark.margin_y} onChange={(event) => setWatermark({ ...watermark, margin_y: event.target.value })} />
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
          </div>
        </section>
      </main>

      <section className="panel">
        <h2>Histórico</h2>
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
                <a className="action-link" href={`${API_BASE_URL}/api/jobs/${job.id}/download`}>
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
    </div>
  );
}

export default App;
