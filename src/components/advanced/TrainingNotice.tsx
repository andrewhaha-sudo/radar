import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
export function TrainingNotice() {
  const [training, setTraining] = useState(false);
  useEffect(() => {
    api
      .get<{ training?: boolean }>('/api/auth/config')
      .then((result) => setTraining(result.training === true))
      .catch(() => {});
  }, []);
  return training ? (
    <div className="training-notice" role="status">
      TRAINING WORKSPACE · Disposable local records · External messages and AI calls blocked · Close
      the training server to discard its database
    </div>
  ) : null;
}
