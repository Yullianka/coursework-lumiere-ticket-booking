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
export function Admin() {
  const [tab, setTab] = useState<Entity | 'users' | 'reports'>('sessions'),
    [rows, setRows] = useState<Row[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [productions, setProductions] = useState<Row[]>([]),
    [halls, setHalls] = useState<Row[]>([]),
    [edit, setEdit] = useState<Row | null | undefined>(undefined),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setLoading(true);
    try {
      if (tab === 'users') setUsers(await api<User[]>('/admin/users'));
      else if (tab !== 'reports') setRows(await api<Row[]>('/admin/' + tab));
      if (tab === 'sessions') {
        const [p, h] = await Promise.all([
          api<Row[]>('/admin/productions'),
          api<Row[]>('/admin/halls'),
        ]);
        setProductions(p);
        setHalls(h);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    setEdit(undefined);
    setError('');
    setNotice('');
    void refresh();
  }, [tab]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget),
      str = (key: string) => String(f.get(key) ?? ''),
      num = (key: string) => Number(str(key));
    try {
      let body: unknown;
      if (tab === 'productions')
        body = {
          title: str('title'),
          description: str('description'),
          type: str('type'),
          durationMinutes: num('durationMinutes'),
          archived: f.has('archived'),
        };
      if (tab === 'halls')
        body = edit
          ? { name: str('name') }
          : {
              name: str('name'),
              rows: num('rows'),
              seatsPerRow: num('seatsPerRow'),
              vipRows: str('vipRows')
                .split(',')
                .filter((s) => s.trim())
                .map(Number),
              balconyRows: str('balconyRows')
                .split(',')
                .filter((s) => s.trim())
                .map(Number),
            };
      if (tab === 'sessions')
        body = {
          productionId: str('productionId'),
          hallId: str('hallId'),
          startsAt: new Date(str('startsAt')).toISOString(),
          prices: Object.fromEntries(
            ['STANDARD', 'VIP', 'BALCONY'].map((k) => [k, Math.round(num(k) * 100)]),
          ),
          archived: f.has('archived'),
        };
      if (tab === 'discounts')
        body = {
          code: str('code'),
          percent: num('percent'),
          validFrom: new Date(str('validFrom')).toISOString(),
          validTo: new Date(str('validTo')).toISOString(),
          active: f.has('active'),
        };
      await api(`/admin/${tab}${edit ? '/' + edit.id : ''}`, edit ? 'PATCH' : 'POST', body);
      setEdit(undefined);
      setNotice('Зміни збережено.');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace wrap">
      <p className="eyebrow">LUMIÈRE / ADMIN</p>
      <h1>За лаштунками</h1>
      <p className="muted">Події, розклад і результати вашого простору.</p>
      <nav className="admin-tabs" aria-label="Керування">
        {Object.entries(labels).map(([key, label]) => (
          <button aria-pressed={tab === key} key={key} onClick={() => setTab(key as Entity)}>
            {label}
          </button>
        ))}
        <button aria-pressed={tab === 'users'} onClick={() => setTab('users')}>
          Клієнти
        </button>
        <button aria-pressed={tab === 'reports'} onClick={() => setTab('reports')}>
          Звіти
        </button>
      </nav>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      {tab === 'reports' ? (
        <Reports />
      ) : loading ? (
        <p role="status">Завантажуємо дані…</p>
      ) : tab === 'users' ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ім’я</th>
                <th>Пошта</th>
                <th>Роль</th>
                <th>Студентська знижка 10%</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.display_name}</td>
                  <td>{u.email}</td>
                  <td>{u.role === 'ADMIN' ? 'Адміністратор' : 'Клієнт'}</td>
                  <td>
                    <button
                      className="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError('');
                        try {
                          await api('/admin/users/' + u.id, 'PATCH', {
                            studentVerified: !u.student_verified,
                          });
                          await refresh();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {u.student_verified ? 'Скасувати підтвердження' : 'Підтвердити статус'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="section-heading">
            <h2>{labels[tab]}</h2>
            <button
              className="primary"
              onClick={() => {
                setEdit(null);
                setError('');
              }}
            >
              + Додати
            </button>
          </div>
          {tab === 'sessions' && (
            <p className="small-note">
              Час у списку — київський. Подію з історією бронювань змінювати не можна.
            </p>
          )}
          {rows.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Назва</th>
                    <th>Деталі</th>
                    <th>Стан</th>
                    <th>
                      <span className="sr-only">Дії</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.title ?? r.name ?? r.code}</strong>
                      </td>
                      <td>
                        {tab === 'productions'
                          ? `${r.type === 'FILM' ? 'Кіно' : 'Театр'} · ${r.duration_minutes} хв`
                          : tab === 'halls'
                            ? `${r.capacity} місць`
                            : tab === 'sessions'
                              ? `${when(r.starts_at!)} · ${r.hall_name}`
                              : `${r.percent}% · ${when(r.valid_from!)} — ${when(r.valid_to!)}`}
                      </td>
                      <td>
                        {tab === 'discounts'
                          ? r.active
                            ? 'Активний'
                            : 'Вимкнений'
                          : r.archived
                            ? 'Архів'
                            : 'Доступний'}
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            setEdit(r);
                            setError('');
                          }}
                        >
                          Редагувати ↗
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">Поки немає записів. Додайте перший.</div>
          )}
        </>
      )}
      {edit !== undefined && tab !== 'users' && tab !== 'reports' && (
        <Modal onClose={() => setEdit(undefined)} locked={busy}>
          <section
            className="dialog editor-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
          >
            <button
              className="close"
              aria-label="Закрити"
              disabled={busy}
              onClick={() => setEdit(undefined)}
            >
              ×
            </button>
            <p className="eyebrow">{labels[tab]}</p>
            <h2 id="editor-title">{edit ? 'Редагування' : 'Новий запис'}</h2>
            <form onSubmit={save} key={tab + (edit?.id ?? 'new')}>
              {tab === 'productions' && (
                <>
                  <label>
                    Назва
                    <input name="title" defaultValue={edit?.title} required maxLength={200} />
                  </label>
                  <label>
                    Опис
                    <textarea
                      name="description"
                      defaultValue={edit?.description}
                      maxLength={5000}
                      rows={4}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Тип
                      <select name="type" defaultValue={edit?.type ?? 'FILM'}>
                        <option value="FILM">Кіно</option>
                        <option value="PLAY">Театр</option>
                      </select>
                    </label>
                    <label>
                      Тривалість, хв
                      <input
                        name="durationMinutes"
                        type="number"
                        min={1}
                        max={600}
                        defaultValue={edit?.duration_minutes ?? 90}
                        required
                      />
                    </label>
                  </div>
                  <label className="check">
                    <input type="checkbox" name="archived" defaultChecked={edit?.archived} />
                    Приховати з афіші
                  </label>
                </>
              )}
              {tab === 'halls' && (
                <>
                  <label>
                    Назва залу
                    <input name="name" defaultValue={edit?.name} required maxLength={200} />
                  </label>
                  {!edit && (
                    <>
                      <div className="form-grid">
                        <label>
                          Кількість рядів
                          <input
                            name="rows"
                            type="number"
                            min={1}
                            max={20}
                            defaultValue={6}
                            required
                          />
                        </label>
                        <label>
                          Місць у ряді
                          <input
                            name="seatsPerRow"
                            type="number"
                            min={1}
                            max={30}
                            defaultValue={8}
                            required
                          />
                        </label>
                      </div>
                      <label>
                        VIP-ряди, через кому
                        <input name="vipRows" placeholder="1,2" />
                      </label>
                      <label>
                        Ряди балкона, через кому
                        <input name="balconyRows" placeholder="5,6" />
                      </label>
                      <p className="small-note">
                        Решта місць — стандарт. Схема фіксується після створення залу.
                      </p>
                    </>
                  )}
                </>
              )}
              {tab === 'sessions' && (
                <>
                  <label>
                    Подія
                    <select name="productionId" defaultValue={edit?.production_id ?? ''} required>
                      <option value="" disabled>
                        Оберіть подію
                      </option>
                      {productions
                        .filter((p) => !p.archived)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Зал
                    <select name="hallId" defaultValue={edit?.hall_id ?? ''} required>
                      <option value="" disabled>
                        Оберіть зал
                      </option>
                      {halls.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} · {h.capacity} місць
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Початок (час вашого пристрою)
                    <input
                      name="startsAt"
                      type="datetime-local"
                      defaultValue={edit?.starts_at ? dateInput(edit.starts_at) : ''}
                      required
                    />
                  </label>
                  <div className="form-grid">
                    {[
                      ['STANDARD', 'Стандарт'],
                      ['VIP', 'VIP'],
                      ['BALCONY', 'Балкон'],
                    ].map(([key, label]) => (
                      <label key={key}>
                        {label}, грн
                        <input
                          name={key}
                          type="number"
                          min={0}
                          max={1000000}
                          step="0.01"
                          defaultValue={(edit?.prices?.[key] ?? 18000) / 100}
                          required
                        />
                      </label>
                    ))}
                  </div>
                  <label className="check">
                    <input type="checkbox" name="archived" defaultChecked={edit?.archived} />
                    Приховати сеанс
                  </label>
                </>
              )}
              {tab === 'discounts' && (
                <>
                  <label>
                    Код
                    <input
                      name="code"
                      defaultValue={edit?.code}
                      pattern="[A-Za-z0-9_\-]{3,32}"
                      minLength={3}
                      maxLength={32}
                      required
                      placeholder="LUMIERE20"
                    />
                  </label>
                  <label>
                    Знижка, %
                    <input
                      name="percent"
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={edit?.percent ?? 20}
                      required
                    />
                  </label>
                  <label>
                    Початок дії (час пристрою)
                    <input
                      name="validFrom"
                      type="datetime-local"
                      defaultValue={dateInput(edit?.valid_from ?? new Date().toISOString())}
                      required
                    />
                  </label>
                  <label>
                    Кінець дії (час пристрою)
                    <input
                      name="validTo"
                      type="datetime-local"
                      defaultValue={edit?.valid_to ? dateInput(edit.valid_to) : ''}
                      required
                    />
                  </label>
                  <label className="check">
                    <input type="checkbox" name="active" defaultChecked={edit?.active ?? true} />
                    Промокод активний
                  </label>
                  <p className="small-note">
                    Знижки не сумуються. Застосовується найбільша з доступних.
                  </p>
                </>
              )}
              {error && (
                <p className="notice error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy ? 'Зберігаємо…' : 'Зберегти зміни'}
              </button>
            </form>
          </section>
        </Modal>
      )}
    </section>
  );
}
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
