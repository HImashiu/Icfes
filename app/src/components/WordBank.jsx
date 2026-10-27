import RichText from "./RichText.jsx";

// The word list of a matching group, drawn once beside its questions. Each description picks its letter from here.
export default function WordBank({ options }) {
  return (
    <section className="paper-card word-bank" aria-label="Lista de palabras">
      <p className="word-bank-title">Palabras</p>
      <ul>
        {options.map((opt) => (
          <li key={opt.letter}>
            <span className="letter-tile">{opt.letter}</span>
            <RichText html={opt.text_md} className="word-text" />
          </li>
        ))}
      </ul>
    </section>
  );
}
