import { useRef } from 'react';
import type { PayslipData } from '../types';
import { exportToJson, importFromJson, resetData } from '../lib/storage';
import { today } from '../lib/date';
import { Modal } from './Modal';

interface Props {
  data: PayslipData;
  update: (updater: (prev: PayslipData) => PayslipData) => void;
  onClose: () => void;
}

export function BackupModal({ data, update, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function download() {
    const blob = new Blob([exportToJson(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `급여명세서-백업-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function pickFile() {
    fileRef.current?.click();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const imported = importFromJson(await file.text());
      if (!window.confirm('현재 데이터를 백업 파일 내용으로 바꿉니다. 계속할까요?')) return;
      update(() => imported);
      onClose();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '파일을 읽지 못했습니다.');
    }
  }

  function reset() {
    if (!window.confirm('직원·근무 기록을 모두 지우고 처음 상태로 되돌립니다. 되돌릴 수 없습니다.')) return;
    update(() => resetData());
    onClose();
  }

  return (
    <Modal title="백업·초기화" onClose={onClose}>
      <p className="hint">
        데이터는 이 브라우저(localStorage)에만 저장됩니다.
        다른 기기로 옮기거나 보관하려면 JSON으로 내려받으세요.
      </p>
      <div className="backup-actions">
        <button className="primary" onClick={download}>JSON으로 내려받기</button>
        <button onClick={pickFile}>백업 파일 불러오기</button>
        <button className="danger" onClick={reset}>전체 초기화</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </Modal>
  );
}
