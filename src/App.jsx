import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  supabase,
  isSupabaseConfigured,
  uploadPhotoIfNeeded,
  deletePhotoFromStorage,
} from './supabase.js';
import './App.css';

const MAX_IMAGE_WIDTH = 1024;
const IMAGE_QUALITY = 0.7;

const STATUS_OPTIONS = ['사용가능', '대여중', '수리중', '폐기'];
const STATUS_CLASS = {
  사용가능: 'ok',
  대여중: 'rent',
  수리중: 'repair',
  폐기: 'disposed',
};

const emptyForm = {
  name: '',
  category: '',
  quantity: 1,
  status: '사용가능',
  location: '',
  note: '',
  photo_url: null,
};

const makeEmptyRepair = () => ({
  date: new Date().toISOString().split('T')[0],
  description: '',
  photo_url: null,
});

// 이미지 리사이즈 + JPEG 압축 (data URL 반환)
async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > MAX_IMAGE_WIDTH) {
          height = (height * MAX_IMAGE_WIDTH) / width;
          width = MAX_IMAGE_WIDTH;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
      };
      img.onerror = () => reject(new Error('이미지 로딩 실패'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}

function SetupScreen() {
  return (
    <div className="app">
      <header className="header">
        <h1>고령군청소년문화의집</h1>
        <p>물품기기 관리 시스템</p>
      </header>
      <section className="card">
        <h2>⚙️ Supabase 설정이 필요합니다</h2>
        <p>
          아직 데이터베이스가 연결되지 않았어요. 아래 환경 변수를 설정하면 앱이 동작합니다.
        </p>
        <pre
          style={{
            background: '#f7fafc',
            padding: 16,
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 13,
          }}
        >
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key`}
        </pre>
        <ul>
          <li>
            <strong>로컬 개발</strong>: 프로젝트 루트에 <code>.env.local</code> 파일을 만들고 위 값을
            넣은 뒤 <code>npm run dev</code>
          </li>
          <li>
            <strong>Cloudflare Pages</strong>: 프로젝트 설정 →{' '}
            <em>Environment variables</em> 에 두 값 추가 후 재배포
          </li>
          <li>
            <strong>테이블 생성</strong>: Supabase → SQL Editor 에서{' '}
            <code>supabase-schema.sql</code> 파일 내용을 실행
          </li>
        </ul>
      </section>
    </div>
  );
}

export default function App() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('전체');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [repairModalItem, setRepairModalItem] = useState(null);
  const [repairForm, setRepairForm] = useState(makeEmptyRepair());
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const fetchItems = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('items')
      .select('*, repairs(*)')
      .order('created_at', { ascending: true });
    if (error) {
      setError('데이터를 불러오지 못했습니다: ' + error.message);
      return;
    }
    const sorted = (data || []).map((item) => ({
      ...item,
      repairs: (item.repairs || []).sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      ),
    }));
    setItems(sorted);
    setRepairModalItem((prev) =>
      prev ? sorted.find((i) => i.id === prev.id) || null : null
    );
  }, []);

  // 초기 로딩 + 실시간 구독
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      await fetchItems();
      setLoading(false);
    })();

    const channel = supabase
      .channel('realtime-items')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => fetchItems()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'repairs' },
        () => fetchItems()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems]);

  const runSafely = async (fn, errorMsg) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      console.error(err);
      setError(errorMsg ? `${errorMsg}: ${err.message || err}` : err.message || String(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = async (e, target) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      if (target === 'form') {
        setForm((prev) => ({ ...prev, photo_url: compressed }));
      } else if (target === 'repair') {
        setRepairForm((prev) => ({ ...prev, photo_url: compressed }));
      }
    } catch (err) {
      alert('사진을 불러오지 못했습니다.');
    }
    e.target.value = '';
  };

  const removePhoto = (target) => {
    if (target === 'form') setForm((prev) => ({ ...prev, photo_url: null }));
    else if (target === 'repair') setRepairForm((prev) => ({ ...prev, photo_url: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('물품명을 입력해주세요.');
      return;
    }

    await runSafely(async () => {
      // 기존 사진 URL (편집 중인 경우)
      const existingItem = editingId
        ? items.find((i) => i.id === editingId)
        : null;
      const oldPhotoUrl = existingItem?.photo_url || null;

      // 사진이 새로 바뀌었으면 업로드
      const photoUrl = await uploadPhotoIfNeeded(form.photo_url);

      const payload = {
        name: form.name.trim(),
        category: form.category || '',
        quantity: Number(form.quantity) || 0,
        status: form.status,
        location: form.location || '',
        note: form.note || '',
        photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase
          .from('items')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;

        // 기존 사진이 교체되었다면 Storage에서 삭제
        if (oldPhotoUrl && oldPhotoUrl !== photoUrl) {
          await deletePhotoFromStorage(oldPhotoUrl);
        }
      } else {
        const { error } = await supabase.from('items').insert(payload);
        if (error) throw error;
      }

      setForm(emptyForm);
      setEditingId(null);
      await fetchItems();
    }, '저장 실패');
  };

  const handleEdit = (item) => {
    setForm({
      name: item.name || '',
      category: item.category || '',
      quantity: item.quantity ?? 1,
      status: item.status || '사용가능',
      location: item.location || '',
      note: item.note || '',
      photo_url: item.photo_url || null,
    });
    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('정말 삭제하시겠습니까? 수리 기록도 함께 삭제됩니다.')) return;
    const target = items.find((i) => i.id === id);
    await runSafely(async () => {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) throw error;

      // 관련 사진들 Storage에서 삭제 (실패해도 무시)
      if (target?.photo_url) await deletePhotoFromStorage(target.photo_url);
      for (const r of target?.repairs || []) {
        if (r.photo_url) await deletePhotoFromStorage(r.photo_url);
      }
      await fetchItems();
    }, '삭제 실패');
  };

  const handleCancel = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  // 수리 기록
  const openRepairModal = (item) => {
    setRepairModalItem(item);
    setRepairForm(makeEmptyRepair());
  };

  const closeRepairModal = () => {
    setRepairModalItem(null);
    setRepairForm(makeEmptyRepair());
  };

  const addRepair = async (e) => {
    e.preventDefault();
    if (!repairForm.description.trim()) {
      alert('수리 내용을 입력해주세요.');
      return;
    }
    await runSafely(async () => {
      const photoUrl = await uploadPhotoIfNeeded(repairForm.photo_url);
      const payload = {
        item_id: repairModalItem.id,
        date: repairForm.date || new Date().toISOString().split('T')[0],
        description: repairForm.description.trim(),
        photo_url: photoUrl,
      };
      const { error: repairErr } = await supabase.from('repairs').insert(payload);
      if (repairErr) throw repairErr;

      // 상태를 수리중으로 자동 변경
      const { error: updateErr } = await supabase
        .from('items')
        .update({ status: '수리중', updated_at: new Date().toISOString() })
        .eq('id', repairModalItem.id);
      if (updateErr) throw updateErr;

      setRepairForm(makeEmptyRepair());
      await fetchItems();
    }, '수리 기록 추가 실패');
  };

  const deleteRepair = async (repairId) => {
    if (!confirm('이 수리 기록을 삭제하시겠습니까?')) return;
    const target = (repairModalItem.repairs || []).find((r) => r.id === repairId);
    await runSafely(async () => {
      const { error } = await supabase.from('repairs').delete().eq('id', repairId);
      if (error) throw error;
      if (target?.photo_url) await deletePhotoFromStorage(target.photo_url);
      await fetchItems();
    }, '수리 기록 삭제 실패');
  };

  // 엑셀 내보내기
  const handleExport = () => {
    if (items.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }
    const data = items.map((item, idx) => ({
      번호: idx + 1,
      물품명: item.name,
      분류: item.category,
      수량: item.quantity,
      상태: item.status,
      위치: item.location,
      비고: item.note,
      사진: item.photo_url ? '있음' : '-',
      수리기록수: (item.repairs || []).length,
      등록일: item.created_at ? item.created_at.split('T')[0] : '-',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 6 }, { wch: 20 }, { wch: 12 }, { wch: 6 },
      { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 8 },
      { wch: 10 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '물품기기');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `고령군청소년문화의집_물품기기_${today}.xlsx`);
  };

  // 엑셀 불러오기 (bulk insert)
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);
        const imported = rows
          .map((row) => ({
            name: row['물품명'] || row['name'] || '',
            category: row['분류'] || row['category'] || '',
            quantity: Number(row['수량'] || row['quantity']) || 0,
            status: row['상태'] || row['status'] || '사용가능',
            location: row['위치'] || row['location'] || '',
            note: row['비고'] || row['note'] || '',
          }))
          .filter((r) => r.name);

        if (imported.length === 0) {
          alert('가져올 데이터가 없습니다.');
          return;
        }

        const replace = confirm(
          `${imported.length}개 항목을 불러왔습니다.\n\n[확인] 기존 데이터 전체 삭제 후 교체\n[취소] 기존 목록에 추가`
        );

        await runSafely(async () => {
          if (replace) {
            // 모든 사진 먼저 정리
            for (const item of items) {
              if (item.photo_url) await deletePhotoFromStorage(item.photo_url);
              for (const r of item.repairs || []) {
                if (r.photo_url) await deletePhotoFromStorage(r.photo_url);
              }
            }
            const { error: delErr } = await supabase
              .from('items')
              .delete()
              .not('id', 'is', null);
            if (delErr) throw delErr;
          }
          const { error: insErr } = await supabase.from('items').insert(imported);
          if (insErr) throw insErr;
          await fetchItems();
        }, '엑셀 불러오기 실패');
      } catch (err) {
        alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const categories = ['전체', ...new Set(items.map((i) => i.category).filter(Boolean))];

  const filtered = items.filter((item) => {
    const matchSearch =
      !search || (item.name || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === '전체' || item.category === categoryFilter;
    const matchStatus = statusFilter === '전체' || item.status === statusFilter;
    return matchSearch && matchCat && matchStatus;
  });

  if (!isSupabaseConfigured) return <SetupScreen />;

  return (
    <div className="app">
      <header className="header">
        <h1>고령군청소년문화의집</h1>
        <p>물품기기 관리 시스템</p>
      </header>

      {error && (
        <div className="banner banner-error">
          {error} <button onClick={() => setError(null)}>닫기</button>
        </div>
      )}

      {busy && <div className="banner banner-info">처리 중...</div>}

      <section className="card">
        <h2>{editingId !== null ? '물품 수정' : '물품 등록'}</h2>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-row">
            <label>
              물품명 *
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleFormChange}
                placeholder="예: 빔프로젝터"
                required
              />
            </label>
            <label>
              분류
              <input
                type="text"
                name="category"
                value={form.category}
                onChange={handleFormChange}
                placeholder="예: 영상, 음향, 도서"
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              수량
              <input
                type="number"
                name="quantity"
                min="0"
                value={form.quantity}
                onChange={handleFormChange}
              />
            </label>
            <label>
              상태
              <select name="status" value={form.status} onChange={handleFormChange}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              보관 위치
              <input
                type="text"
                name="location"
                value={form.location}
                onChange={handleFormChange}
                placeholder="예: 2층 창고"
              />
            </label>
          </div>

          <label>
            비고
            <input
              type="text"
              name="note"
              value={form.note}
              onChange={handleFormChange}
              placeholder="특이사항"
            />
          </label>

          <div className="photo-section">
            <div className="photo-label">물품 사진</div>
            {form.photo_url ? (
              <div className="photo-preview">
                <img src={form.photo_url} alt="미리보기" />
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => removePhoto('form')}
                >
                  사진 삭제
                </button>
              </div>
            ) : (
              <div className="photo-buttons">
                <label className="btn-camera">
                  사진 촬영
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handlePhotoChange(e, 'form')}
                    style={{ display: 'none' }}
                  />
                </label>
                <label className="btn-gallery">
                  갤러리 선택
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePhotoChange(e, 'form')}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="form-buttons">
            {editingId !== null && (
              <button type="button" onClick={handleCancel} disabled={busy}>
                취소
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={busy}>
              {editingId !== null ? '수정 완료' : '등록'}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="toolbar">
          <input
            type="text"
            className="search"
            placeholder="물품명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                분류: {c}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="전체">상태: 전체</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                상태: {s}
              </option>
            ))}
          </select>
          <button onClick={handleExport} className="btn-primary">
            엑셀 내보내기
          </button>
          <label className="btn-secondary">
            엑셀 불러오기
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>물품 목록 ({filtered.length}개)</h2>
        {loading ? (
          <p className="empty">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="empty">등록된 물품이 없습니다.</p>
        ) : (
          <div className="items-grid">
            {filtered.map((item) => (
              <div key={item.id} className="item-card">
                <div className="item-photo">
                  {item.photo_url ? (
                    <img
                      src={item.photo_url}
                      alt={item.name}
                      onClick={() => setPhotoPreview(item.photo_url)}
                    />
                  ) : (
                    <div className="no-photo">사진 없음</div>
                  )}
                </div>
                <div className="item-body">
                  <div className="item-title">
                    <h3>{item.name}</h3>
                    <span className={`badge badge-${STATUS_CLASS[item.status] || 'ok'}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="item-info">
                    <div>분류: {item.category || '-'}</div>
                    <div>수량: {item.quantity}</div>
                    <div>위치: {item.location || '-'}</div>
                    {item.note && <div>비고: {item.note}</div>}
                    {(item.repairs || []).length > 0 && (
                      <div className="repair-count">
                        수리 기록 {item.repairs.length}건
                      </div>
                    )}
                  </div>
                  <div className="item-buttons">
                    <button onClick={() => handleEdit(item)}>수정</button>
                    <button onClick={() => openRepairModal(item)}>수리</button>
                    <button
                      className="btn-danger"
                      onClick={() => handleDelete(item.id)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {photoPreview && (
        <div className="modal" onClick={() => setPhotoPreview(null)}>
          <img src={photoPreview} alt="사진" className="modal-image" />
        </div>
      )}

      {repairModalItem && (
        <div className="modal" onClick={closeRepairModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{repairModalItem.name} - 수리 기록</h2>
              <button onClick={closeRepairModal}>닫기</button>
            </div>

            <form onSubmit={addRepair} className="form">
              <label>
                수리 일자
                <input
                  type="date"
                  value={repairForm.date}
                  onChange={(e) =>
                    setRepairForm((p) => ({ ...p, date: e.target.value }))
                  }
                />
              </label>
              <label>
                수리 내용 *
                <textarea
                  value={repairForm.description}
                  onChange={(e) =>
                    setRepairForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="수리 사유, 진행 상황, 비용 등"
                  rows={3}
                />
              </label>

              <div className="photo-section">
                <div className="photo-label">수리 상황 사진</div>
                {repairForm.photo_url ? (
                  <div className="photo-preview">
                    <img src={repairForm.photo_url} alt="수리 사진" />
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => removePhoto('repair')}
                    >
                      사진 삭제
                    </button>
                  </div>
                ) : (
                  <div className="photo-buttons">
                    <label className="btn-camera">
                      사진 촬영
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handlePhotoChange(e, 'repair')}
                        style={{ display: 'none' }}
                      />
                    </label>
                    <label className="btn-gallery">
                      갤러리 선택
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handlePhotoChange(e, 'repair')}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                )}
              </div>

              <button type="submit" className="btn-primary" disabled={busy}>
                수리 기록 추가
              </button>
            </form>

            <div className="repair-list">
              <h3>
                기록된 수리 내역 ({(repairModalItem.repairs || []).length}건)
              </h3>
              {(repairModalItem.repairs || []).length === 0 ? (
                <p className="empty">수리 기록이 없습니다.</p>
              ) : (
                (repairModalItem.repairs || [])
                  .slice()
                  .reverse()
                  .map((r) => (
                    <div key={r.id} className="repair-item">
                      <div className="repair-header">
                        <strong>{r.date}</strong>
                        <button
                          className="btn-danger"
                          onClick={() => deleteRepair(r.id)}
                        >
                          삭제
                        </button>
                      </div>
                      <p>{r.description}</p>
                      {r.photo_url && (
                        <img
                          src={r.photo_url}
                          alt="수리 사진"
                          onClick={() => setPhotoPreview(r.photo_url)}
                        />
                      )}
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <p>고령군청소년문화의집 물품기기 관리 시스템</p>
      </footer>
    </div>
  );
}
