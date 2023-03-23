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
        
<!-- TRANSACTION Body Form -->
        <div v-if="dialogType=='transaction'" class="dialog-body-form">
            <q-card-section>
                <div class="text-h3">Edit Transaction</div>
                <br />
                <div class="text-h4">$ {{item.amount}}</div>
            </q-card-section>

            <!-- Q-Form -->
                <div class="text-p">{{dialogBody.name}}</div>
                <q-input
                filled
                v-model="this.dialogBody.date"
                lazy-rules
                label="Date"
                class="q-field--with-bottom"
                />

                <q-select
                    filled
                    v-model="this.dialogBody.mappedCategory"
                    label="Category Name"
                    :options="dropDownOptions"
                    class="q-field--with-bottom"
                    @touchmove.stop.prevent
                    />
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

<!-- CATEGORY Body Form -->
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
            :disable="true"
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

            <q-toggle color="primary" :disable="true" label="Show on View Budgets screen" v-model="this.dialogBody.showOnBudgetPage" />

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

input .select{
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
        },
        dropDown: {
            type: Array,
            required: false,
        }
      },
      data(){
        console.log('beginning of data log: ', this.item)
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
            },
            initialData: null
        };
      },
      
computed: {
    dropDownOptions() {
        // let dropDown = this.dropDown
        const options = this.dropDown.map(item => item.category);

        console.log('dropDownOptions =',this.dropDown)
        console.log('options =',options)
        options.sort()
        return options
    }
  },
  methods: {
        onTransactionFormReset () {
            this.dialogBody = JSON.parse(JSON.stringify(this.initialData));
        },
        updateTransaction() {
            this.editedTransaction = {...this.dialogBody}
            console.log('updateTransaction: edited Transaction: ', this.editedTransaction)
            this.$emit('update-transaction', this.editedTransaction)
        },
        updateCategory() {
            this.editedCategory = {...this.dialogBody, '_id': this.item._id}
            console.log('updateCategory: edited Category: ', this.editedCategory)
            this.$emit('update-category', this.editedCategory)
        },
        buildEditCategoryDialog() {

        },
        resetData(){
            // reset the dialogBody to its initial state
            this.dialogBody = JSON.parse(JSON.stringify(this.initialData));
        }
    },
    created() {
        this.initialData = JSON.parse(JSON.stringify(this.dialogBody));
        console.log('created child component dialog', this.initialData)
    }
  }
</script>