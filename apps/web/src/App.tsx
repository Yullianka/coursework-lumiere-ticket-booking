import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  money,
  when,
  category,
  type User,
  type Session,
  type Seat,
  type Booking,
} from './api';
import { Modal } from './Modal';
const states: Record<string, string> = {
  PENDING: 'Очікує оплати',
  PAID: 'Оплачено',
  CANCELLED: 'Скасовано',
  EXPIRED: 'Час вичерпано',
};
function Auth({ close, done }: { close: () => void; done: () => Promise<void> }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      await api(`/auth/${register ? 'register' : 'login'}`, 'POST', data);
      await done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal onClose={close} locked={busy}>
      <section
        className="dialog auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button className="close" aria-label="Закрити" disabled={busy} onClick={close}>
          ×
        </button>
        <p className="eyebrow">ВАШ ПРОСТІР LUMIÈRE</p>
        <h2 id="auth-title">{register ? 'Раді знайомству' : 'З поверненням'}</h2>
        <p className="muted">Збережіть місце для наступної історії.</p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Ваше ім’я
              <input autoFocus name="displayName" autoComplete="name" maxLength={100} required />
            </label>
          )}
          <label>
            Електронна пошта
            <input
              autoFocus={!register}
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          {register && (
            <small>Щонайменше 8 символів. Студентський статус підтверджує адміністратор.</small>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Зачекайте…' : register ? 'Створити акаунт' : 'Увійти'}
          </button>
        </form>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register ? 'Уже маєте акаунт? Увійти' : 'Уперше тут? Зареєструватися'}
        </button>
      </section>
    </Modal>
  );
}
