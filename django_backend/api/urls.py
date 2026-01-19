from django.urls import path
from . import views

urlpatterns = [
    # Health check
    path('health/', views.HealthCheckView.as_view(), name='health-check'),
    
    # Authentication
    path('register/', views.RegisterView.as_view(), name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('verify/', views.VerifyEmailView.as_view(), name='verify-email'),
    path('resend-verification/', views.ResendVerificationView.as_view(), name='resend-verification'),
    path('resend/', views.ResendVerificationView.as_view(), name='resend-legacy'),
    
    # Password Reset
    path('forgot-password/', views.ForgotPasswordView.as_view(), name='forgot-password'),
    path('verify-reset/', views.VerifyResetCodeView.as_view(), name='verify-reset-code'),
    path('reset-password/', views.ResetPasswordView.as_view(), name='reset-password'),
    
    # Shop Endpoints
    path('products/', views.ProductListView.as_view(), name='products'),
    path('products/<int:pk>/like/', views.LikeProductView.as_view(), name='like-product'),
    path('products/<int:pk>/rate/', views.AddReviewView.as_view(), name='rate-product'),
    path('newsletter/', views.NewsletterView.as_view(), name='newsletter'),
]
