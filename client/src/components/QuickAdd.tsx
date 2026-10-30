import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ProductDetail } from '../lib/types';
import { Link } from '../lib/router';
import { toast } from '../store/toast';
import { Modal, Picture, Price } from './ui';
import { QtyPicker, StockNote, VariantOptions, useVariantPicker } from './Variants';

function Body({ p, onClose }: { p: ProductDetail; onClose: () => void }) {
  const pk = useVariantPicker(p);
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="mini-line" style={{ gridTemplateColumns: '72px 1fr' }}>
        <div className="line-img" style={{ width: 72, position: 'relative' }}><Picture img={p.image} sizes="72px" /></div>
        <div><Link to={`/product/${p.slug}`} onClick={onClose} style={{ fontWeight: 600 }}>{p.name}</Link><div><Price price={p.price} oldPrice={p.oldPrice} /></div></div>
      </div>
      <VariantOptions pk={pk} />
      <StockNote pk={pk} />
      <div className="buy-row">
        <QtyPicker pk={pk} />
        <button className="btn" disabled={pk.variant ? pk.free <= 0 : false} onClick={() => {
          if (pk.add()) { toast.ok(`«${p.name}» у кошику`, { label: 'Відкрити кошик', to: '/cart' }); onClose(); }
        }}>Додати до кошика</button>
      </div>
    </div>
  );
}

/** Швидке додавання з картки: товари з вибором розміру/кольору відкривають вікно вибору. */
export function QuickAdd({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [p, setP] = useState<ProductDetail>();
  const [err, setErr] = useState<Error>();
  useEffect(() => { api<{ product: ProductDetail }>(`/api/products/${encodeURIComponent(slug)}`).then((r) => setP(r.product)).catch(setErr); }, [slug]);
  useEffect(() => { if (err) { toast.error(err.message); onClose(); } }, [err, onClose]);
  return (
    <Modal title="Додати до кошика" onClose={onClose}>
      {p ? <Body p={p} onClose={onClose} /> : <div className="skel" style={{ height: 180 }} aria-busy="true" />}
    </Modal>
  );
}
