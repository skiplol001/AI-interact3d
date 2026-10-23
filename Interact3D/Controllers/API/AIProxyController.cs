using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Interact3D.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
public class AIProxyController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;

    public AIProxyController(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
    }

    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] JsonElement payload)
    {
        // ⭐ ƯU TIÊN KEY TỪ FRONTEND (BYOK - Bring Your Own Key)
        string? apiKey = null;

        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var clientKey = authHeader.Substring("Bearer ".Length).Trim();
            if (!string.IsNullOrEmpty(clientKey))
            {
                apiKey = clientKey;
                Console.WriteLine($"[AIProxy] Dùng key từ Frontend (HUD) - Độ dài: {clientKey.Length} ký tự");
            }
        }

        // Fallback: dùng key từ config nếu Frontend không gửi
        // ⚠️ NẾU DEPLOY PUBLIC: để trống dòng này trong appsettings.json để buộc user tự nhập key
        if (string.IsNullOrEmpty(apiKey))
        {
            apiKey = _configuration["TheHive:ApiKey"];
            if (!string.IsNullOrEmpty(apiKey))
            {
                Console.WriteLine("[AIProxy] Dùng key từ appsettings.json (fallback)");
            }
        }

        if (string.IsNullOrEmpty(apiKey))
        {
            return StatusCode(401, new
            {
                error = "Chưa có API Key. Vui lòng nhập key trên HUD (biểu tượng 🔑).",
                code = "MISSING_KEY"
            });
        }

        var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        client.Timeout = TimeSpan.FromSeconds(60);

        var content = new StringContent(payload.GetRawText(), Encoding.UTF8, "application/json");

        try
        {
            var response = await client.PostAsync("https://api-cdn.thehive.ai/api/v3/chat/completions", content);
            var responseBody = await response.Content.ReadAsStringAsync();

            Console.WriteLine($"[TheHive Response] Status: {(int)response.StatusCode} - Body: {responseBody.Substring(0, Math.Min(200, responseBody.Length))}");

            if (!response.IsSuccessStatusCode)
            {
                return StatusCode((int)response.StatusCode, new
                {
                    error = "TheHive API lỗi",
                    status = (int)response.StatusCode,
                    detail = responseBody
                });
            }

            return Content(responseBody, "application/json");
        }
        catch (TaskCanceledException)
        {
            return StatusCode(504, new { error = "TheHive API timeout (>60s). Thử lại sau." });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AIProxy] Exception: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}