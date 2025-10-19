import React, { useEffect, useState } from "react";
import { Parser, Quad, NamedNode, Literal } from "n3";

type Field =
  | { kind: "string"; predicate: string; label: string; value: string }
  | { kind: "number"; predicate: string; label: string; value: number | "" }
  | { kind: "boolean"; predicate: string; label: string; value: boolean }
  | { kind: "date"; predicate: string; label: string; value: string }
  | { kind: "textarea"; predicate: string; label: string; value: string }
  | { kind: "iri"; predicate: string; label: string; value: string };

type FormState = Record<string, Field>;

type TypeInfo = {
  iri: string;
  label: string;        // rdfs:label (fr > en) ou localName
  description?: string; // rdfs:comment | dcterms:description (fr > en) si dispo
};

const XSD  = "http://www.w3.org/2001/XMLSchema#";
const RDF  = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const DCT  = "http://purl.org/dc/terms/";

function humanizePredicate(iri: string) {
  const last = iri.split(/[\/#]/).pop() || iri;
  const base = last.replace(/[_\-]+/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** util: retourne la “meilleure” valeur littérale parmi candidats par langue (fr > en > sans-lang) */
function pickBestLangLiteral(values: Literal[], pref: string[] = ["fr", "en"]): string | undefined {
  // 1) exact match sur langues préférées (ordre)
  for (const lang of pref) {
    const hit = values.find(v => v.language?.toLowerCase() === lang);
    if (hit) return hit.value;
  }
  // 2) sinon un littéral sans langue
  const noLang = values.find(v => !v.language);
  if (noLang) return noLang.value;
  // 3) sinon premier dispo
  return values[0]?.value;
}

function fieldFromObject(predicate: string, obj: NamedNode | Literal): Field | null {
  const label = humanizePredicate(predicate);

  if (obj.termType === "NamedNode") {
    return { kind: "iri", predicate, label, value: obj.value };
  }

  const val = obj.value;
  const dt = (obj.datatype && obj.datatype.value) || "";

  if (dt.startsWith(XSD)) {
    const local = dt.slice(XSD.length);
    switch (local) {
      case "boolean":
        return { kind: "boolean", predicate, label, value: /^true$/i.test(val) };
      case "date":
      case "dateTime": {
        const dateOnly = val.slice(0, 10);
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

  if (val.length > 120) {
    return { kind: "textarea", predicate, label, value: val };
  }

  if (/^(true|false)$/i.test(val)) {
    return { kind: "boolean", predicate, label, value: /^true$/i.test(val) };
  }

  if (/^-?\d+(\.\d+)?$/.test(val)) {
    const num = Number(val);
    return { kind: "number", predicate, label, value: Number.isNaN(num) ? "" : num };
  }

  return { kind: "string", predicate, label, value: val };
}

function fieldsFromQuads(quads: Quad[], resourceIri: string): FormState {
  const state: FormState = {};
  const rows = quads.filter(
    (q) => q.subject.termType === "NamedNode" && q.subject.value === resourceIri
  );

  for (const q of rows) {
    const pred = (q.predicate as NamedNode).value;
    const field = fieldFromObject(pred, q.object as NamedNode | Literal);
    if (field) state[pred] = field;
  }

  // On garde rdf:type pour la section “Types du graphe”, donc on ne le supprime plus ici.
  // delete state[RDF + "type"];

  return state;
}

/** extrait la liste des types (rdf:type) et tente d’en tirer un label + description depuis le même graphe */
function extractTypeInfos(quads: Quad[], resourceIri: string): TypeInfo[] {
  const typePred = RDF + "type";
  // 1) récupérer les objets rdf:type du sujet
  const typeIris = quads
    .filter(q =>
      q.subject.termType === "NamedNode" &&
      q.subject.value === resourceIri &&
      q.predicate.termType === "NamedNode" &&
      (q.predicate as NamedNode).value === typePred &&
      q.object.termType === "NamedNode"
    )
    .map(q => (q.object as NamedNode).value);

  // dédupliquer
  const uniq = Array.from(new Set(typeIris));

  // 2) pour chaque type IRI, chercher ses rdfs:label / rdfs:comment / dcterms:description dans le même graphe
  const bySubject = new Map<string, Quad[]>();
  for (const q of quads) {
    if (q.subject.termType === "NamedNode") {
      const s = (q.subject as NamedNode).value;
      if (!bySubject.has(s)) bySubject.set(s, []);
      bySubject.get(s)!.push(q);
    }
  }

  const LABEL  = RDFS + "label";
  const COMMENT = RDFS + "comment";
  const DESCR  = DCT  + "description";

  const types: TypeInfo[] = uniq.map(iri => {
    const subjQuads = bySubject.get(iri) || [];

    const labels = subjQuads
      .filter(q => q.predicate.termType === "NamedNode" && (q.predicate as NamedNode).value === LABEL && q.object.termType === "Literal")
      .map(q => q.object as Literal);

    const comments = subjQuads
      .filter(q => q.predicate.termType === "NamedNode" && (q.predicate as NamedNode).value === COMMENT && q.object.termType === "Literal")
      .map(q => q.object as Literal);

    const descriptions = subjQuads
      .filter(q => q.predicate.termType === "NamedNode" && (q.predicate as NamedNode).value === DESCR && q.object.termType === "Literal")
      .map(q => q.object as Literal);

    const label =
      pickBestLangLiteral(labels) ||
      iri.split(/[\/#]/).pop() || // fallback localName
      iri;

    const description =
      pickBestLangLiteral(descriptions) ||
      pickBestLangLiteral(comments) ||
      undefined;

    return { iri, label, description };
  });

  return types;
}

/** --- Composant principal --- */
export default function App() {
  const endpoint = "https://dbpedia.org/sparql";
  const resourceIri = "http://dbpedia.org/resource/Paris";

  const [form, setForm] = useState<FormState | null>(null);
  const [types, setTypes] = useState<TypeInfo[]>([]);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDescribe() {
      setLoading(true);
      setError(null);
      try {
        const query = `DESCRIBE <${resourceIri}>`;
        const url = new URL(endpoint);
        url.searchParams.set("query", query);

        const res = await fetch(url.toString(), {
          headers: { Accept: "text/turtle" },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const turtle = await res.text();
        setRaw(turtle);

        const parser = new Parser();
        const quads = parser.parse(turtle);

        const fields = fieldsFromQuads(quads, resourceIri);
        const typeInfos = extractTypeInfos(quads, resourceIri);

        setForm(fields);
        setTypes(typeInfos);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDescribe();
  }, [endpoint, resourceIri]);

  function updateField(pred: string, value: any) {
    if (!form) return;
    setForm({ ...form, [pred]: { ...form[pred], value } });
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2>Formulaire RDF auto-généré (DBpedia Turtle)</h2>
      <div style={{ fontSize: 12, color: "#555" }}>
        Endpoint: {endpoint} — IRI: {resourceIri}
      </div>

      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: "red" }}>Erreur : {error}</p>}

      {/* === Section Types du graphe (rdf:type) === */}
      {!!types.length && (
        <section
          style={{
            marginTop: 16,
            marginBottom: 20,
            padding: 12,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#f9fafb",
          }}
        >
          <h3 style={{ margin: 0, marginBottom: 8 }}>Types du graphe (rdf:type)</h3>
          <ul style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 10 }}>
            {types.map(t => (
              <li key={t.iri}>
                <div style={{ fontWeight: 600 }}>
                  {t.label}{" "}
                  <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 12 }}>
                    ({t.iri})
                  </span>
                </div>
                {t.description && (
                  <div style={{ whiteSpace: "pre-wrap" }}>{t.description}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {form && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            alert(JSON.stringify({ form, types }, null, 2));
          }}
          style={{ display: "grid", gap: 16, maxWidth: 800 }}
        >
          {Object.values(form).map((field) => {
            const key = field.predicate;
            const label = (
              <label htmlFor={key} style={{ fontWeight: 600 }}>
                {field.label}
                <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12 }}> ({key})</span>
              </label>
            );

            // On rend rdf:type en lecture seule si présent dans form
            const isRdfType = key === RDF + "type";

            switch (field.kind) {
              case "boolean":
                return (
                  <div key={key}>
                    {label}
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={(e) => updateField(key, e.target.checked)}
                      disabled={isRdfType}
                    />
                  </div>
                );
              case "number":
                return (
                  <div key={key}>
                    {label}
                    <input
                      type="number"
                      value={field.value}
                      onChange={(e) => updateField(key, Number(e.target.value))}
                      disabled={isRdfType}
                    />
                  </div>
                );
              case "date":
                return (
                  <div key={key}>
                    {label}
                    <input
                      type="date"
                      value={field.value}
                      onChange={(e) => updateField(key, e.target.value)}
                      disabled={isRdfType}
                    />
                  </div>
                );
              case "textarea":
                return (
                  <div key={key}>
                    {label}
                    <textarea
                      value={field.value}
                      rows={5}
                      style={{ width: "100%" }}
                      onChange={(e) => updateField(key, e.target.value)}
                      readOnly={isRdfType}
                    />
                  </div>
                );
              case "iri":
                return (
                  <div key={key}>
                    {label}
                    <input
                      type="text"
                      value={field.value}
                      readOnly
                      style={{ width: "100%" }}
                    />
                  </div>
                );
              default:
                return (
                  <div key={key}>
                    {label}
                    <input
                      type="text"
                      value={field.value}
                      style={{ width: "100%" }}
                      onChange={(e) => updateField(key, e.target.value)}
                      readOnly={isRdfType}
                    />
                  </div>
                );
            }
          })}

          <button type="submit">Afficher JSON (champs + types)</button>

          <details>
            <summary style={{ cursor: "pointer" }}>Turtle brut</summary>
            <pre style={{ whiteSpace: "pre-wrap", background: "#f8f8f8", padding: 8 }}>
              {raw}
            </pre>
          </details>
        </form>
      )}
    </div>
  );
}