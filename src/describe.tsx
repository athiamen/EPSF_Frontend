import React, { useEffect, useMemo, useState } from "react";
import { Parser, Quad, NamedNode, Literal } from "n3";

/** ---- Types ---- */
type Field =
  | { kind: "string"; predicate: string; label: string; value: string }
  | { kind: "number"; predicate: string; label: string; value: number | "" }
  | { kind: "boolean"; predicate: string; label: string; value: boolean }
  | { kind: "date"; predicate: string; label: string; value: string } // yyyy-mm-dd
  | { kind: "textarea"; predicate: string; label: string; value: string }
  | { kind: "iri"; predicate: string; label: string; value: string };

type FormState = Record<string, Field>;

const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

/** Label “humain” pour un IRI */
function humanizePredicate(iri: string) {
  const last = iri.split(/[\/#]/).pop() || iri;
  const base = last.replace(/[_\-]+/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Déduit un type de champ depuis un objet RDF */
function fieldFromObject(predicate: string, obj: NamedNode | Literal): Field | null {
  const label = humanizePredicate(predicate);

  if (obj.termType === "NamedNode") {
    return { kind: "iri", predicate, label, value: obj.value };
  }

  // Literal
  const val = obj.value;
  const dt = (obj.datatype && obj.datatype.value) || "";
  const lang = (obj.language && obj.language) || "";

  // Heuristique : long => textarea
  if (!dt && val.length > 140) {
    return { kind: "textarea", predicate, label, value: val };
  }

  // Langue sans datatype => string
  if (lang) {
    return { kind: "string", predicate, label: `${val}` };
  }

  if (dt.startsWith(XSD)) {
    const local = dt.slice(XSD.length);
    switch (local) {
      case "boolean":
        return { kind: "boolean", predicate, label, value: /^true$/i.test(val) };
      case "date":
      case "dateTime": {
        const iso = val;
        const dateOnly = iso.length >= 10 ? iso.slice(0, 10) : iso;
        return { kind: "date", predicate, label, value: dateOnly };
      }
      case "integer":
      case "decimal":
      case "double":
      case "float": {
        const num = Number(val);
        return { kind: "number", predicate, label, value: Number.isNaN(num) ? "" : num };
      }
      default:
        return { kind: "string", predicate, label, value: val };
    }
  }

  // Sans datatype : bool/num strings reconnus
  if (/^(true|false)$/i.test(val)) {
    return { kind: "boolean", predicate, label, value: /^true$/i.test(val) };
  }
  if (/^-?\d+(\.\d+)?$/.test(val)) {
    const num = Number(val);
    return { kind: "number", predicate, label, value: Number.isNaN(num) ? "" : num };
  }

  return { kind: "string", predicate, label, value: val };
}

/** Construit un état de formulaire (1ère valeur par prédicat) à partir de quads */
function fieldsFromQuads(quads: Quad[], resourceIri: string): FormState {
  const state: FormState = {};

  // Ne garder que les quads dont le sujet est la ressource
  const rows = quads.filter(
    (q) => q.subject.termType === "NamedNode" && q.subject.value === resourceIri
  );

  // Grouper par prédicat
  const byPred = new Map<string, Quad[]>();
  for (const q of rows) {
    const p = (q.predicate as NamedNode).value;
    if (!byPred.has(p)) byPred.set(p, []);
    byPred.get(p)!.push(q);
  }

  for (const [pred, qs] of byPred) {
    const first = qs[0];
    const obj = first.object;
    const field = fieldFromObject(pred, obj as NamedNode | Literal);
    if (field) state[pred] = field;
  }

  // Optionnel: masquer rdf:type pour ne pas polluer
  delete state[RDF + "type"];

  return state;
}

/** ---- Composant ---- */
export function FormFromDescribeN3({
  endpoint,
  resourceIri,
  className,
}: {
  endpoint: string;
  resourceIri: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [rawTurtle, setRawTurtle] = useState<string>("");

  const sparql = useMemo(() => `DESCRIBE <${resourceIri}>`, [resourceIri]);

  useEffect(() => {
    const abort = new AbortController();

    async function run() {
      setLoading(true);
      setError(null);
      setForm(null);
      setRawTurtle("");

      try {
        // GET avec querystring (beaucoup d’endpoints l’acceptent)
        const url = new URL(endpoint);
        url.searchParams.set("query", sparql);

        let res = await fetch(url.toString(), {
          headers: { Accept: "text/turtle, application/x-turtle;q=0.9, text/plain;q=0.8" },
          signal: abort.signal,
        });

        if (!res.ok) {
          // Fallback POST
          res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              Accept: "text/turtle, application/x-turtle;q=0.9, text/plain;q=0.8",
            },
            body: new URLSearchParams({ query: sparql }).toString(),
            signal: abort.signal,
          });
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} – échec de la requête SPARQL`);
        }

        const turtle = await res.text();
        setRawTurtle(turtle);

        // Parse Turtle -> quads
        const parser = new Parser();
        const quads = parser.parse(turtle);

        const fields = fieldsFromQuads(quads, resourceIri);

        // Si rien trouvé précisément sur cette IRI, tenter une heuristique:
        if (!Object.keys(fields).length) {
          // prendre le 1er sujet “NamedNode” présent
          const firstS = quads.find((q) => q.subject.termType === "NamedNode")?.subject as
            | NamedNode
            | undefined;
          if (firstS) {
            const altFields = fieldsFromQuads(quads, firstS.value);
            if (Object.keys(altFields).length) {
              setForm(altFields);
              setLoading(false);
              return;
            }
          }
          throw new Error("Aucun triple pour la ressource dans la réponse Turtle.");
        }

        setForm(fields);
      } catch (e: any) {
        setError(e?.message || "Erreur réseau/parse Turtle");
      } finally {
        setLoading(false);
      }
    }

    run();
    return () => abort.abort();
  }, [endpoint, resourceIri, sparql]);

  function updateField(pred: string, value: any) {
    if (!form) return;
    setForm({ ...form, [pred]: { ...(form[pred] as Field), value } as Field });
  }

  return (
    <div className={className}>
      <header style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Formulaire (DESCRIBE + Turtle + n3)</h2>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Endpoint: <code>{endpoint}</code> — Ressource: <code>{resourceIri}</code>
        </div>
      </header>

      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: "crimson" }}>Erreur : {error}</p>}

      {form && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            alert("Données locales (aucun SPARQL UPDATE envoyé) :\n\n" + JSON.stringify(form, null, 2));
          }}
          style={{ display: "grid", gap: 14, alignItems: "start", maxWidth: 820 }}
        >
          {Object.values(form).map((field) => {
            const key = field.predicate;
            const label = (
              <label htmlFor={key} style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                {field.label}{" "}
                <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12 }}>({key})</span>
              </label>
            );

            switch (field.kind) {
              case "boolean":
                return (
                  <div key={key}>
                    {label}
                    <input
                      id={key}
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => updateField(key, e.target.checked)}
                    />
                  </div>
                );
              case "number":
                return (
                  <div key={key}>
                    {label}
                    <input
                      id={key}
                      type="number"
                      value={field.value}
                      onChange={(e) =>
                        updateField(key, e.target.value === "" ? "" : Number(e.target.value))
                      }
                      style={{ width: "100%", padding: "8px 10px" }}
                    />
                  </div>
                );
              case "date":
                return (
                  <div key={key}>
                    {label}
                    <input
                      id={key}
                      type="date"
                      value={field.value}
                      onChange={(e) => updateField(key, e.target.value)}
                      style={{ padding: "8px 10px" }}
                    />
                  </div>
                );
              case "textarea":
                return (
                  <div key={key}>
                    {label}
                    <textarea
                      id={key}
                      value={field.value}
                      onChange={(e) => updateField(key, e.target.value)}
                      rows={6}
                      style={{ width: "100%", padding: "8px 10px", lineHeight: 1.4 }}
                    />
                  </div>
                );
              case "iri":
                return (
                  <div key={key}>
                    {label}
                    <input id={key} type="url" value={field.value} readOnly style={{ width: "100%", padding: "8px 10px" }} />
                  </div>
                );
              case "string":
              default:
                return (
                  <div key={key}>
                    {label}
                    <input
                      id={key}
                      type="text"
                      value={field.value}
                      onChange={(e) => updateField(key, e.target.value)}
                      style={{ width: "100%", padding: "8px 10px" }}
                    />
                  </div>
                );
            }
          })}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit">Afficher les données</button>
            <details>
              <summary>Voir le Turtle brut</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{rawTurtle}</pre>
            </details>
          </div>
        </form>
      )}
    </div>
  );
}

/** Exemple d’usage */
export default function ExamplePage() {
  return (
    <div style={{ padding: 20 }}>
      <FormFromDescribeN3
        endpoint="https://query.wikidata.org/sparql"
        resourceIri="http://www.wikidata.org/entity/Q42"
      />
    </div>
  );
}