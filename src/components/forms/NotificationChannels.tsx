import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
type Channels = {
  push: { configured: boolean; publicKey: string | null };
  sms: { configured: boolean };
  note: string;
  jobs: Array<{ id: number; state: string; updatedAt: string }>;
  deliveries: Array<{
    id: number;
    channel: string;
    state: string;
    detail: string;
    createdAt: string;
  }>;
};
function keyBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export function NotificationChannels() {
  const [data, setData] = useState<Channels | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [phone, setPhone] = useState('');
  async function load() {
    try {
      setData(await api.get<Channels>('/api/notifications/channels'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="ops-card">
      <h3>Push and SMS consent / delivery status</h3>
      <p>{data?.note}</p>
      <p>
        Browser push:{' '}
        {data?.push.configured
          ? 'Configured; a successful subscription and delivery test are still required'
          : 'Not configured'}
        . SMS:{' '}
        {data?.sms.configured
          ? 'Configured; recipient consent and provider acceptance are still required'
          : 'Not configured'}
        .
      </p>
      <div className="ops-form-grid">
        <button
          className="command-action blue"
          disabled={!data?.push.configured}
          onClick={async () => {
            setError('');
            try {
              if (
                !('Notification' in window) ||
                !('serviceWorker' in navigator) ||
                !('PushManager' in window)
              )
                throw new Error('This browser cannot subscribe to web push.');
              if ((await Notification.requestPermission()) !== 'granted')
                throw new Error('Notification permission was not granted.');
              await navigator.serviceWorker.register('/sw.js');
              const registration = await navigator.serviceWorker.getRegistration();
              if (!registration?.active)
                throw new Error(
                  'Open the production PWA over HTTPS before enabling push. The development server does not register a service worker.',
                );
              const subscription =
                (await registration.pushManager.getSubscription()) ??
                (await registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: keyBytes(data!.push.publicKey!),
                }));
              await api.post('/api/notifications/push/subscribe', {
                consent: true,
                subscription: subscription.toJSON(),
              });
              setNotice(
                'Push subscription saved. This does not prove a future notification was delivered.',
              );
              await load();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          Allow browser push notifications
        </button>
        <button
          className="command-action blue"
          onClick={async () => {
            try {
              const reg = await navigator.serviceWorker?.getRegistration();
              const subscription = await reg?.pushManager.getSubscription();
              if (subscription) {
                await api.post('/api/notifications/push/unsubscribe', {
                  endpoint: subscription.endpoint,
                });
                await subscription.unsubscribe();
              }
              setNotice('Browser push subscription removed.');
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          Stop browser push
        </button>
        <label>
          My E.164 mobile number
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+63…"
            type="tel"
          />
        </label>
        <button
          className="command-action blue"
          disabled={!data?.sms.configured}
          onClick={async () => {
            if (
              !window.confirm(
                'Allow this school to send SMS alerts to this number? Carrier fees may apply.',
              )
            )
              return;
            try {
              await api.post('/api/notifications/sms/consent', { phone, consent: true });
              setNotice('SMS consent recorded. No SMS was sent by this action.');
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          Consent to school SMS alerts
        </button>
        <button
          className="school-back"
          onClick={async () => {
            await api.post('/api/notifications/sms/consent', { consent: false });
            setNotice('SMS consent revoked.');
          }}
        >
          Revoke SMS consent
        </button>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {(data?.jobs ?? []).length > 0 && (
        <>
          <button
            className="school-back"
            onClick={async () => {
              try {
                await api.post('/api/notifications/drain', {});
                await load();
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            Process pending delivery requests now
          </button>
          {data?.jobs.map((j) => (
            <p key={j.id}>
              Delivery request {j.id}: {j.state} · {j.updatedAt}
            </p>
          ))}
        </>
      )}
      {data?.deliveries.length ? (
        <div>
          <h3>Provider receipts</h3>
          {data.deliveries.map((d) => (
            <p key={d.id}>
              {d.channel} · {d.state} · {d.createdAt}
              <br />
              {d.detail}
            </p>
          ))}
        </div>
      ) : (
        <p>No provider delivery receipts recorded.</p>
      )}
    </section>
  );
}
