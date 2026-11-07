import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import { api, money, when, type User } from './api';
type Entity = 'productions' | 'halls' | 'sessions' | 'discounts';
interface Row {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  type?: string;
  duration_minutes?: number;
  archived?: boolean;
  capacity?: number;
  production_id?: string;
  hall_id?: string;
  hall_name?: string;
  starts_at?: string;
  prices?: Record<string, number>;
  code?: string;
  percent?: number;
  valid_from?: string;
  valid_to?: string;
  active?: boolean;
}
interface Report {
  summary: { tickets: number; revenue: string };
  revenue: {
    session_id: string;
    title: string;
    starts_at: string;
    tickets: number;
    revenue: string;
  }[];
  occupancy: {
    day: string;
    hall: string;
    capacity: number;
    sold: number;
    reserved: number;
    percent: string;
  }[];
}
const labels: Record<Entity, string> = {
  productions: 'Події',
  halls: 'Зали',
  sessions: 'Сеанси',
  discounts: 'Промокоди',
};
const dateInput = (date: string) => {
  const d = new Date(date);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
function Reports() {
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
    [to, setTo] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const start = new Date(from + 'T00:00:00'),
        end = new Date(to + 'T00:00:00');
      end.setDate(end.getDate() + 1);
      setReport(
        await api<Report>(
          `/admin/reports?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!report) return;
    const lines = [
      ['Report', 'Period from', from, 'Period to', to],
      ['Tickets sold', report.summary.tickets, 'Revenue UAH', Number(report.summary.revenue) / 100],
      [],
      ['Production', 'Session', 'Tickets', 'Revenue UAH'],
      ...report.revenue.map((r) => [
        r.title,
        when(r.starts_at),
        r.tickets,
        Number(r.revenue) / 100,
      ]),
      [],
      ['Day', 'Hall', 'Capacity', 'Sold', 'Reserved', 'Occupancy %'],
      ...report.occupancy.map((r) => [r.day, r.hall, r.capacity, r.sold, r.reserved, r.percent]),
    ];
    const csv =
      '\uFEFF' +
      lines
        .map((row) =>
          row
            .map(
              (value) =>
                '"' +
                String(value)
                  .replace(/^[=+@-]/, "'$&")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(';'),
        )
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })),
      a = document.createElement('a');
    a.href = url;
    a.download = `lumiere-report-${from}-${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <h2>Результати простору</h2>
      <form className="report-filter" onSubmit={load}>
        <label>
          Від
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label>
          До, включно
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'Рахуємо…' : 'Сформувати звіт'}
        </button>
      </form>
      <p className="small-note">
        Межі періоду — за часом пристрою. Продажі враховано за датою оплати, завантаженість — за
        датою сеансу (Київ). Максимальний період — один рік.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <>
          <div className="metrics">
            <article>
              <span>ПРОДАНО КВИТКІВ</span>
              <strong>{report.summary.tickets}</strong>
            </article>
            <article>
              <span>ВИРУЧКА</span>
              <strong>{money(report.summary.revenue)}</strong>
            </article>
            <button className="outline" onClick={download}>
              Завантажити CSV ↓
            </button>
          </div>
          <h3>Виручка по сеансах</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Подія</th>
                  <th>Початок</th>
                  <th>Квитки</th>
                  <th>Виручка</th>
                </tr>
              </thead>
              <tbody>
                {report.revenue.map((r) => (
                  <tr key={r.session_id}>
                    <td>{r.title}</td>
                    <td>{when(r.starts_at)}</td>
                    <td>{r.tickets}</td>
                    <td>{money(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.revenue.length && <p className="empty">Продажів за цей період немає.</p>}
          </div>
          <h3>Завантаженість залів за днями</h3>
          <p className="small-note">
            Місткість — сума місць усіх сеансів цього дня. Завантаженість = продані місця /
            місткість.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Зал</th>
                  <th>Місткість</th>
                  <th>Продано</th>
                  <th>Заброньовано</th>
                  <th>Завантаженість</th>
                </tr>
              </thead>
              <tbody>
                {report.occupancy.map((r) => (
                  <tr key={r.day + r.hall}>
                    <td>{r.day}</td>
                    <td>{r.hall}</td>
                    <td>{r.capacity}</td>
                    <td>{r.sold}</td>
                    <td>{r.reserved}</td>
                    <td>
                      <div className="occupancy">
                        <progress max={100} value={Number(r.percent)} />
                        {r.percent}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.occupancy.length && <p className="empty">Сеансів за цей період немає.</p>}
          </div>
        </>
      )}
    </>
  );
}
