export default function Topbar({ title }) {
  return (
    <header className="topbar no-print">
      <h1>{title}</h1>
      <div className="avatar" />
    </header>
  );
}
