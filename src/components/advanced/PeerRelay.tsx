import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { workspaceId } from '@/lib/workspace';
import { downloadText, type Row } from './tools';
function checkedPacket(value: Row) {
  if (
    value?.version !== 1 ||
    typeof value.id !== 'string' ||
    !/^[-a-zA-Z0-9]{12,80}$/.test(value.id) ||
    typeof value.school !== 'string' ||
    !/^\d{6}$/.test(value.school) ||
    !['medical', 'fire', 'earthquake', 'other'].includes(value.kind) ||
    typeof value.note !== 'string' ||
    value.note.length > 500 ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.now() ||
    Date.parse(value.expiresAt) > Date.now() + 15 * 60000
  )
    throw new Error('Invalid or expired relay draft.');
  return {
    version: 1,
    training: value.training === true,
    id: value.id,
    school: value.school,
    kind: value.kind,
    note: value.note,
    expiresAt: value.expiresAt,
  };
}
export function PeerRelay() {
  const { can } = useAuth();
  const [training, setTraining] = useState(false);
  useEffect(() => {
    api
      .get<{ training?: boolean }>('/api/auth/config')
      .then((result) => setTraining(result.training === true))
      .catch(() => {});
  }, []);
  const outgoingId = useRef<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null),
    channel = useRef<RTCDataChannel | null>(null);
  const [signal, setSignal] = useState(''),
    [remote, setRemote] = useState(''),
    [status, setStatus] = useState('Not paired'),
    [packet, setPacket] = useState<Row | null>(null),
    [incoming, setIncoming] = useState<Row | null>(null),
    [note, setNote] = useState(''),
    [kind, setKind] = useState('other'),
    [school, setSchool] = useState(workspaceId()),
    [error, setError] = useState('');
  useEffect(
    () => () => {
      channel.current?.close();
      pc.current?.close();
    },
    [],
  );
  function bind(dc: RTCDataChannel) {
    channel.current = dc;
    dc.onopen = () => setStatus('Peer connected; no request delivered yet');
    dc.onclose = () => setStatus('Peer connection closed');
    dc.onmessage = (event) => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 5000)
          throw new Error('Unsupported relay data.');
        const value = JSON.parse(event.data);
        if (value.ack === true) {
          if (value.id !== outgoingId.current || !outgoingId.current)
            throw new Error('Acknowledgement does not match the outgoing packet.');
          setStatus(
            `Peer acknowledged packet ${value.id} on that device. This does not confirm school-server storage or emergency response.`,
          );
          return;
        }
        if (
          value.version !== 1 ||
          typeof value.note !== 'string' ||
          value.note.length > 500 ||
          Date.parse(value.expiresAt) <= Date.now()
        )
          throw new Error('Invalid or expired packet.');
        setIncoming(checkedPacket(value));
      } catch (err) {
        setError(errorMessage(err));
      }
    };
  }
  async function connection() {
    channel.current?.close();
    pc.current?.close();
    let servers: RTCIceServer[] = [];
    if (navigator.onLine)
      try {
        servers = (await api.get<{ iceServers: RTCIceServer[] }>('/api/advanced/relay/ice'))
          .iceServers;
      } catch {
        setStatus('Relay service settings unavailable; trying local-network pairing only.');
      }
    const p = new RTCPeerConnection({ iceServers: servers });
    pc.current = p;
    p.ondatachannel = (e) => bind(e.channel);
    p.onconnectionstatechange = () => {
      if (['failed', 'disconnected'].includes(p.connectionState))
        setStatus('Peer connection unavailable. No emergency delivery is confirmed.');
    };
    return p;
  }
  async function gather(p: RTCPeerConnection) {
    await new Promise<void>((resolve) => {
      if (p.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, 6000);
      p.onicegatheringstatechange = () => {
        if (p.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      };
    });
    setSignal(JSON.stringify(p.localDescription));
  }
  async function createOffer() {
    setError('');
    try {
      const p = await connection();
      bind(p.createDataChannel('radar-unverified-draft'));
      await p.setLocalDescription(await p.createOffer());
      await gather(p);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function answer() {
    setError('');
    try {
      const description = JSON.parse(remote);
      if (
        description.type !== 'offer' ||
        typeof description.sdp !== 'string' ||
        description.sdp.length > 50000
      )
        throw new Error('Paste a valid peer offer.');
      const p = await connection();
      await p.setRemoteDescription(description);
      await p.setLocalDescription(await p.createAnswer());
      await gather(p);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function finish() {
    try {
      const description = JSON.parse(remote);
      if (
        description.type !== 'answer' ||
        typeof description.sdp !== 'string' ||
        description.sdp.length > 50000
      )
        throw new Error('Paste a valid peer answer.');
      if (!pc.current) throw new Error('Create an offer first.');
      await pc.current.setRemoteDescription(description);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  return (
    <>
      <section className="ops-card">
        <h2>Peer-to-peer emergency draft relay</h2>
        <p>
          Optional WebRTC data channel for nearby supported browsers. Pair manually with someone you
          trust; connection descriptions can disclose local network details. No public signalling
          service or automatic emergency dispatch is used. LAN/browser restrictions can prevent
          offline pairing; verify on the actual devices.
        </p>
        <div className="ops-form-grid">
          <button className="command-action blue" onClick={() => void createOffer()}>
            1. Create pairing offer
          </button>
          <label className="wide">
            My pairing description
            <textarea readOnly value={signal} />
          </label>
          <label className="wide">
            Trusted peer’s offer or answer
            <textarea value={remote} onChange={(e) => setRemote(e.target.value)} />
          </label>
          <button className="command-action blue" onClick={() => void answer()}>
            2. Answer a peer offer
          </button>
          <button className="command-action blue" onClick={() => void finish()}>
            3. Accept peer answer
          </button>
        </div>
        <p role="status">{status}</p>
      </section>
      <section className="ops-card">
        <h3>Prepare a short, unverified assistance draft</h3>
        <div className="ops-form-grid">
          <label>
            School BEIS ID
            <input
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              pattern="[0-9]{6}"
              maxLength={6}
            />
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              {['medical', 'fire', 'earthquake', 'other'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="wide">
            Short request (avoid names, medical records or precise GPS)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </label>
          <button
            className="command-action blue"
            onClick={() => {
              if (!/^\d{6}$/.test(school)) {
                setError('Choose the school’s six-digit BEIS ID.');
                return;
              }
              const id = crypto.randomUUID();
              outgoingId.current = id;
              setPacket({
                version: 1,
                training,
                id,
                school,
                kind,
                note,
                expiresAt: new Date(Date.now() + 600000).toISOString(),
              });
            }}
          >
            Create 10-minute draft
          </button>
        </div>
        {packet && (
          <>
            <p>
              Packet {packet.id} · expires {packet.expiresAt}. Nothing has been sent.
            </p>
            <button
              className="command-action blue"
              disabled={channel.current?.readyState !== 'open'}
              onClick={() => {
                channel.current?.send(JSON.stringify(packet));
                setStatus('Sent to peer channel; waiting for explicit device acknowledgement.');
              }}
            >
              Send draft to paired peer
            </button>
            <button
              className="school-back"
              onClick={() =>
                downloadText(
                  'radar-unverified-relay.json',
                  JSON.stringify(packet),
                  'application/json',
                )
              }
            >
              Export packet file
            </button>
          </>
        )}
      </section>
      <section className="ops-card">
        <h3>Incoming unverified draft</h3>
        <label>
          Import a packet file
          <input
            type="file"
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                try {
                  if (file.size > 5000) throw new Error('Packet file is too large.');
                  setIncoming(checkedPacket(JSON.parse(await file.text())));
                } catch (err) {
                  setError(errorMessage(err));
                }
              }
            }}
          />
        </label>
        {incoming ? (
          <>
            <p>
              {incoming.id} · school {incoming.school} · {incoming.kind}
            </p>
            <p>{String(incoming.note).slice(0, 500)}</p>
            <p>Sender identity and conditions are unverified.</p>
            <button
              className="school-back"
              disabled={channel.current?.readyState !== 'open'}
              onClick={() =>
                channel.current?.send(
                  JSON.stringify({
                    ack: 'received_on_device',
                    id: incoming.id,
                  }),
                )
              }
            >
              Acknowledge receipt on this device
            </button>
            {can('incidents:write') && (
              <button
                className="command-action blue"
                onClick={async () => {
                  try {
                    const result = await api.post<{ message: string }>(
                      '/api/advanced/relay/receive',
                      { packet: incoming },
                    );
                    setStatus(result.message);
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                Save for authorized school review
              </button>
            )}
          </>
        ) : (
          <p>
            No packet received. An offline draft does not establish that responders received an SOS.
          </p>
        )}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
