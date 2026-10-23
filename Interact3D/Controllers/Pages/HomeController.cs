using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Interact3D.Controllers.Pages;

[Authorize]
public class HomeController : Controller
{
    public IActionResult Index()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var username = User.Identity?.Name ?? "User";
        var displayName = User.FindFirst(ClaimTypes.GivenName)?.Value ?? username;
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? "User";

        // Lấy token từ Session để client JS tương tác với API
        var token = HttpContext.Session.GetString("JWToken") ?? string.Empty;

        ViewBag.UserId = userIdClaim;
        ViewBag.Username = username;
        ViewBag.DisplayName = displayName;
        ViewBag.Role = role;
        ViewBag.Token = token;

        return View();
    }
}