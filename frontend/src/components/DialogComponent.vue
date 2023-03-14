<template>
    <q-card class="bg-white">
        <!-- Dialog: Top Bar -->
        <q-bar class="bg-primary titlebar">
        <q-space />
        <q-btn dense flat icon="minimize" @click="maximizedToggle = false" :disable="!maximizedToggle">
            <q-tooltip v-if="maximizedToggle" class="bg-white text-primary">Minimize</q-tooltip>
        </q-btn>
        <q-btn dense flat icon="crop_square" @click="maximizedToggle = true" :disable="maximizedToggle">
            <q-tooltip v-if="!maximizedToggle" class="bg-white text-primary">Maximize</q-tooltip>
        </q-btn>
        <q-btn dense flat icon="close" v-close-popup>
            <q-tooltip class="bg-white text-primary">Close</q-tooltip>
        </q-btn>
        </q-bar>
        
<!-- Dialog: Edit Transaction Body Form -->
        <div v-if="dialogType=='transaction'" class="dialog-body-form">
            <q-card-section>
                <div class="text-h3">Edit Transaction</div>
                <br />
                <div class="text-h4">$ {{item.amount}}</div>
            </q-card-section>

            <!-- Q-Form -->
            <div class="text-p">{{dialogBody.name}}</div>
            <div class="form-input">
                <q-input
                filled
                v-model="this.dialogBody.date"
                label="Date"
                />
            </div>
            <div class="form-input">
                <q-input
                filled
                v-model="this.dialogBody.mappedCategory"
                label="Category"
                />
            </div>
            <div class="button-container">
            <div>
                <q-btn @click="updateTransaction" label="Submit" type="submit" color="primary"/>
                <q-btn label="Reset" type="reset" color="secondary" flat class="q-ml-sm" />
            </div>
            <div>
                <q-btn label="Cancel" v-close-popup color="accent"/>
            </div>
            </div>
        </div>

<!-- Dialog: Edit Category Body Form -->
        <div v-if="dialogType=='category'" class="dialog-body-form">
            <q-card-section>
                <div class="text-h3">Edit Category: {{this.dialogBody.originalCategoryName}}</div>
            </q-card-section>

            <!-- Q-Form -->
            <q-input
            filled
            v-model="this.dialogBody.categoryName"
            label="Category Name"
            lazy-rules
            :rules="[ val => val && val.length > 0 || 'Please type something']"
            />

            <q-input
            filled
            type="number"
            v-model="this.dialogBody.monthly_limit"
            label="Monthly Limit"
            lazy-rules
            :rules="[
                val => val !== null && val !== '' || 'Please enter a monthly limit',
            ]"
            />

            <q-toggle color="primary" label="Show on View Budgets screen" v-model="this.dialogBody.showOnBudgetPage" />

            <div class="button-container">
            <div>
                <q-btn @click="updateCategory" label="Submit" type="submit" color="primary"/>
                <q-btn label="Reset" type="reset" color="secondary" flat class="q-ml-sm" />
            </div>
            <div>
                <q-btn label="Cancel" v-close-popup  color="accent"/>
            </div>
            </div>
        </div>
    </q-card>
</template>

<style>

.form-input{
    padding: 10px;
}

</style>

<script>
  import {ref} from 'vue'
  export default {
      name: 'DialogComponent',
      props: {
        dialogType: {
          type: String,
          required: true,
        },
        item: {
          type: Object,
          required: true,
        }
      },
      data(){
        return {
            maximizedToggle: ref(true),
            editedTransaction: {},
            dialogBody:{
                amount: this.item.amount ? this.item.amount : 0 ,
                name: this.item.name ? this.item.name : '',
                monthly_limit: this.item.monthly_limit ? this.item.monthly_limit : 0,
                showOnBudgetPage: this.item.showOnBudgetPage ? this.item.showOnBudgetPage : true,
                date: this.item.date ? this.item.date : '',
                transaction_id: this.item.transaction_id ? this.item.transaction_id : '',
                merchantName: this.item.merchant_name ? this.item.merchant_name : '',
                mappedCategory: this.item.mappedCategory ? this.item.mappedCategory : '',
                categoryName: this.item.categoryName ? this.item.categoryName : '',
                originalCategoryName: this.item.categoryName ? this.item.categoryName : this.item.mappedCategory,
                dialogType: this.dialogType
            }
        };
      },
      
computed: {
  },
  methods: {
        onTransactionFormReset () {
            console.log(this.item)
        },
        updateTransaction() {
            this.editedTransaction = {...this.dialogBody}
            console.log('updateTransaction: edited Transaction: ', this.editedTransaction)
            this.$emit('update-transaction', this.editedTransaction)
        },
        updateCategory() {
            this.editedCategory = {...this.dialogBody}
            console.log('updateTransaction: edited Category: ', this.editedCategory)
            this.$emit('update-category', this.editedCategory)
        },
        buildEditCategoryDialog() {

        }
    },
    created() {
        console.log('created child component dialog')
    }
  }
</script>