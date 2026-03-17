// ──────────────────────────────────────────────
// Inventory Panel — SKU-level tracking
// ──────────────────────────────────────────────
import { computed } from 'vue';
import { fmt, fmtCur } from '../data.js';

export default {
  name: 'InventoryPanel',
  props: ['inventory', 'search', 'page', 'sortField', 'sortDir'],
  emits: ['update:search', 'update:page', 'sort', 'export'],
  setup(props, { emit }) {
    const PAGE_SIZE = 20;

    const filtered = computed(() => {
      if (!props.inventory) return [];
      let items = props.inventory.items;
      if (props.search) {
        const q = props.search.toLowerCase();
        items = items.filter(i => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
      }
      return items;
    });

    const sorted = computed(() => {
      const arr = [...filtered.value];
      const dir = props.sortDir === 'asc' ? 1 : -1;
      arr.sort((a, b) => {
        const av = a[props.sortField];
        const bv = b[props.sortField];
        if (typeof av === 'string') return av.localeCompare(bv) * dir;
        return (av - bv) * dir;
      });
      return arr;
    });

    const paged = computed(() => {
      const start = props.page * PAGE_SIZE;
      return sorted.value.slice(start, start + PAGE_SIZE);
    });

    const totalPages = computed(() => Math.ceil(sorted.value.length / PAGE_SIZE));

    function doSort(field) {
      emit('sort', field);
    }

    const statusCounts = computed(() => {
      if (!props.inventory) return {};
      return {
        out: props.inventory.outOfStock,
        low: props.inventory.lowStock,
        ok: props.inventory.healthyStock,
        total: props.inventory.total,
      };
    });

    return { paged, totalPages, doSort, statusCounts, filtered, fmt, fmtCur, PAGE_SIZE };
  },
  template: `
    <div v-if="inventory">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="badge badge-red" v-if="statusCounts.out > 0">{{ statusCounts.out }} Out of Stock</div>
          <div class="badge badge-gold" v-if="statusCounts.low > 0">{{ statusCounts.low }} Low Stock</div>
          <div class="badge badge-green">{{ statusCounts.ok }} Healthy</div>
          <span style="font-size:11px;color:var(--text-muted)">{{ statusCounts.total }} SKUs</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="search-input" placeholder="Search SKU, name, category..." :value="search" @input="$emit('update:search', $event.target.value); $emit('update:page', 0)" />
          <button class="header-btn" @click="$emit('export')" title="Export CSV">📥 Export</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th @click="doSort('sku')" style="cursor:pointer">SKU</th>
              <th @click="doSort('name')" style="cursor:pointer">Product</th>
              <th @click="doSort('category')" style="cursor:pointer">Category</th>
              <th @click="doSort('price')" style="cursor:pointer" class="num">Price</th>
              <th @click="doSort('stock')" style="cursor:pointer" class="num">Stock</th>
              <th @click="doSort('velocity')" style="cursor:pointer" class="num">Velocity/day</th>
              <th @click="doSort('daysOfStock')" style="cursor:pointer" class="num">Days Left</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in paged" :key="item.sku">
              <td style="font-family:monospace;font-size:11px;color:var(--text-muted)">{{ item.sku }}</td>
              <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="item.name">{{ item.name }}</td>
              <td>{{ item.category }}</td>
              <td class="num">{{ fmtCur(item.price) }}</td>
              <td class="num">{{ fmt(item.stock) }}</td>
              <td class="num">{{ item.velocity }}</td>
              <td class="num" :style="{ color: item.daysOfStock <= 3 ? 'var(--red)' : item.daysOfStock <= 10 ? 'var(--orange)' : 'var(--text-secondary)', fontWeight: item.daysOfStock <= 3 ? 700 : 400 }">{{ item.daysOfStock }}d</td>
              <td>
                <span v-if="item.status === 'out'" class="badge badge-red">OUT</span>
                <span v-else-if="item.status === 'critical'" class="badge badge-red">CRITICAL</span>
                <span v-else-if="item.status === 'low'" class="badge badge-gold">LOW</span>
                <span v-else>
                  <div class="stock-bar stock-ok"><div class="stock-bar-fill" :style="{ width: Math.min(100, (item.stock / (item.reorderPoint * 3)) * 100) + '%' }"></div></div>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:12px;color:var(--text-muted)">
        <span>Showing {{ page * PAGE_SIZE + 1 }}–{{ Math.min((page + 1) * PAGE_SIZE, filtered.length) }} of {{ filtered.length }}</span>
        <div style="display:flex;gap:6px">
          <button class="header-btn" :disabled="page === 0" @click="$emit('update:page', page - 1)" style="padding:4px 10px;font-size:11px">← Prev</button>
          <button class="header-btn" :disabled="page >= totalPages - 1" @click="$emit('update:page', page + 1)" style="padding:4px 10px;font-size:11px">Next →</button>
        </div>
      </div>
    </div>
  `,
};
