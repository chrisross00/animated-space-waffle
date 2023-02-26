<template>
    <table>
      <thead>
        <tr>
          <th v-for="header in headerLabels" :key="header">{{ header }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in tableData" :key="row._id">
          <td v-for="header in headerLabels" :key="header">
            <template v-if="header === 'Amount'">
              ${{ row[header] }}
            </template>
            <template v-else>
              {{ row[header] }}
            </template>
        </td>
        </tr>
      </tbody>
    </table>
  </template>
  
  <script>
    export default {
      props: {
        headerLabels: {
          type: Array,
          required: true,
        },
        tableData: {
          type: Array,
          required: true,
        },
      },
    };
  </script>
  