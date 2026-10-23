using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Interact3D.DTOs.Auth;
using Interact3D.Services.Interfaces;

namespace Interact3D.Controllers.Pages;

public class AuthController : Controller
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpGet]
    public IActionResult Login(string? returnUrl = null)
    {
        if (User.Identity?.IsAuthenticated == true)
            return RedirectToAction("Index", "Home");

        ViewBag.ReturnUrl = returnUrl;
        return View();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(LoginRequest model, string? returnUrl = null)
    {
        if (!ModelState.IsValid)
            return View(model);

        var result = await _authService.AuthenticateAsync(model);
        if (!result.Success || result.Data == null)
        {
            ModelState.AddModelError(string.Empty, result.Message);
            return View(model);
        }

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, result.Data.Id.ToString()),
            new(ClaimTypes.Name, result.Data.Username),
            new(ClaimTypes.GivenName, result.Data.DisplayName ?? result.Data.Username),
            new(ClaimTypes.Role, result.Data.Role)
        };

        var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var authProperties = new AuthenticationProperties
        {
            IsPersistent = model.RememberMe,
            ExpiresUtc = model.RememberMe ? DateTimeOffset.UtcNow.AddDays(7) : DateTimeOffset.UtcNow.AddHours(3)
        };

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(claimsIdentity),
            authProperties);

        // Lưu JWT Token và UserId vào Session để JavaScript Three.js gọi API
        HttpContext.Session.SetString("JWToken", result.Data.Token ?? string.Empty);
        HttpContext.Session.SetInt32("UserId", result.Data.Id);

        if (!string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl))
            return Redirect(returnUrl);

        return RedirectToAction("Index", "Home");
    }

    [HttpGet]
    public IActionResult Register()
    {
        if (User.Identity?.IsAuthenticated == true)
            return RedirectToAction("Index", "Home");

        return View();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Register(RegisterRequest model)
    {
        if (!ModelState.IsValid)
            return View(model);

        var result = await _authService.RegisterAsync(model);
        if (!result.Success)
        {
            ModelState.AddModelError(string.Empty, result.Message);
            return View(model);
        }

        TempData["SuccessMessage"] = "Đăng ký thành công! Bạn có thể đăng nhập ngay.";
        return RedirectToAction("Login");
    }

    [HttpPost]
    [HttpGet]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        HttpContext.Session.Clear();
        return RedirectToAction("Login");
    }
}