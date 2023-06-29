<template>
  <div>
    <div>
      {{ message }}
    </div>
    <br/>
    <div>
      <div>Results where count = 1: {{ countOne }}</div>
      <div>Results where count = 2: {{ countTwo }}</div>
      <div>Results where count = 3: {{ countThree }}</div>
      <div>Total sets of category groups: {{ countAll }}</div>
    </div>
    
    <div v-if="data">
      <pre id="json">{{ data }}</pre>
    </div>
  </div>
</template>

<script>
import { findSimilarTransactionGroups } from '@/firebase'

export default {
  data() {
    return {
      message: '',
      data: {},
      countOne: 0,
      countTwo: 0,
      countThree: 0,
      countAll: 0
    }
  },
  async mounted() {
    try {
      const response = await findSimilarTransactionGroups()
      const data = await response;
      this.message = data.message
      this.data = data.data

      // Set the count values
      this.countOne = this.getCountOccurrences(1);
      this.countTwo = this.getCountOccurrences(2);
      this.countThree = this.getCountOccurrences(3);
      this.countAll = this.getCountOccurrences();

      document.getElementById("json").textContent = JSON.stringify(data, undefined, 2);
    } catch (err) {
      // Handle error
    }
  },
  methods: {
    getCountOccurrences(count) {
      let occurrences = 0;
      let distinctOccurrences = new Set();
      
      if (this.data && this.data.length > 0) {
        for (const result of this.data) {
          if (count === undefined) {
            distinctOccurrences.add(result.count);
          } else if (result.count === count) {
            occurrences++;
          }
        }
      }
      
      return count === undefined ? distinctOccurrences.size : occurrences;
    }
  }
}
</script>
