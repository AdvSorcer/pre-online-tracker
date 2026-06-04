<script setup lang="ts">
import { computed } from 'vue'
import type { Environment, TestItem } from '../types'

const props = defineProps<{
  items: TestItem[]
  environments: Environment[]
  activeEnvironment: Environment
}>()

const emit = defineEmits<{
  openEnvironment: [environment: Environment]
}>()

const stats = computed(() =>
  props.environments.map((environment) => {
    const scoped = props.items.filter((item) => item.environment === environment)
    const pass = scoped.filter((item) => item.status === 'Pass').length
    const fail = scoped.filter((item) => item.status === 'Fail').length
    const fixed = scoped.filter((item) => item.status === 'Fixed').length
    const retest = scoped.filter((item) => item.status === 'Retest').length
    const pending = scoped.filter((item) => item.status === 'Pending').length
    const untested = scoped.filter((item) => item.status === '未測試').length
    const completed = pass + fail + fixed + retest
    const rate = scoped.length === 0 ? 0 : Math.round((completed / scoped.length) * 100)
    return { environment, total: scoped.length, pass, fail, fixed, retest, pending, untested, rate }
  })
)

const overallStats = computed(() => {
  const pending = props.items.filter((item) => item.status === 'Pending').length
  const untested = props.items.filter((item) => item.status === '未測試').length
  return {
    tested: props.items.length - pending - untested,
    pending,
    untested
  }
})
</script>

<template>
  <section class="stats-screen">
    <div class="section-heading">
      <p class="eyebrow">Overview</p>
      <h2>統計資訊</h2>
    </div>

    <div class="summary-grid">
      <n-card class="summary-card">
        <span>已測試項目</span>
        <strong>{{ overallStats.tested }}</strong>
      </n-card>
      <n-card class="summary-card">
        <span>待確認</span>
        <strong>{{ overallStats.pending }}</strong>
      </n-card>
      <n-card class="summary-card">
        <span>尚未測試</span>
        <strong>{{ overallStats.untested }}</strong>
      </n-card>
    </div>

    <div class="stats-grid">
      <n-card
        v-for="stat in stats"
        :key="stat.environment"
        class="stat-card"
        :class="{ active: activeEnvironment === stat.environment }"
        hoverable
        @click="emit('openEnvironment', stat.environment)"
      >
        <n-space vertical size="small">
          <span>{{ stat.environment }}</span>
          <strong>{{ stat.rate }}%</strong>
          <small>
            總數 {{ stat.total }} / Pass {{ stat.pass }} / Fail {{ stat.fail }} / Fixed {{ stat.fixed }} /
            Retest {{ stat.retest }} / Pending {{ stat.pending }} / 未測試 {{ stat.untested }}
          </small>
        </n-space>
      </n-card>
    </div>
  </section>
</template>
