<template>
  <div>
    <select v-model="selectedMonth">
      <option v-for="month in months" :value="month">{{ month }}</option>
    </select>
  </div>
</template>

<script>
export default {
  props: {
    transactions: {
      type: Array,
      required: true,
    },
  },
  data() {
    return {
      selectedMonth: null,
      months: [],
    };
  },
  mounted() {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    // Get the min/max date range from the transaction data
    const dateRange = this.transactions.reduce((range, transaction) => {
      const date = new Date(transaction.Date);
      if (!range.minDate || date < range.minDate) {
        range.minDate = date;
      }
      if (!range.maxDate || date > range.maxDate) {
        range.maxDate = date;
      }
      return range;
    }, { minDate: null, maxDate: null });

    const months = [];
    for (let year = dateRange.minDate.getFullYear(); year <= currentYear; year++) {
      const startMonth = year === dateRange.minDate.getFullYear() ? dateRange.minDate.getMonth() : 0;
      const endMonth = year === currentYear ? currentMonth : 11;
      for (let month = startMonth; month <= endMonth; month++) {
        const monthString = `${monthNames[month]} ${year}`;
        months.push(monthString);
      }
    }
    this.months = months.reverse();
  },
};
</script>
