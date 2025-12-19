from django.contrib import admin
from .models import Product, Review, ExchangeRate

@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ('usd_to_naira', 'last_updated')
    list_editable = ('usd_to_naira',)
    list_display_links = None

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'price', 'currency', 'category', 'seller', 'created_at')
    list_filter = ('currency', 'category', 'created_at')
    search_fields = ('name', 'description', 'location')

admin.site.register(Review)
